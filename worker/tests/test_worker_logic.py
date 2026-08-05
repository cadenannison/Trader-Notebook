"""
Worker logic tests.

Tests pure/extracted functions — no network calls, no Supabase, no Resend.
Covers: market hours, trigger hit/miss, cooldown, crypto helpers, weekly digest
week-label window, daily briefing behavioral streak detection.
"""

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytz

# Worker reads env vars at import time — provide safe defaults
os.environ.setdefault("MASTER_KEY", "a" * 64)
# weekly_digest / daily_briefing require these (no default in the module itself)
os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "x")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from worker.trigger_worker import (  # noqa: E402
    _already_warned_today,
    _in_cooldown,
    _is_market_hours,
    _is_trigger_hit,
    decrypt,
    derive_key,
    update_trigger_post_fire,
)
from worker.weekly_digest import _week_label  # noqa: E402
from worker.weekly_digest import _in_send_window as _weekly_in_send_window  # noqa: E402
from worker.daily_briefing import _behavioral_alerts, _consecutive_streak  # noqa: E402
from worker.daily_briefing import _in_send_window as _daily_in_send_window  # noqa: E402

_ET = pytz.timezone("America/New_York")

# ── Market hours ──────────────────────────────────────────────────────────────


def test_market_closed_saturday():
    sat = _ET.localize(datetime(2026, 5, 9, 12, 0))
    assert _is_market_hours(sat) is False


def test_market_closed_sunday():
    sun = _ET.localize(datetime(2026, 5, 10, 12, 0))
    assert _is_market_hours(sun) is False


def test_market_closed_before_open():
    early = _ET.localize(datetime(2026, 5, 11, 9, 0))  # Monday 9:00 AM
    assert _is_market_hours(early) is False


def test_market_closed_at_exactly_open_minus_one_minute():
    before = _ET.localize(datetime(2026, 5, 11, 9, 29))
    assert _is_market_hours(before) is False


def test_market_open_at_930():
    open_time = _ET.localize(datetime(2026, 5, 11, 9, 30))
    assert _is_market_hours(open_time) is True


def test_market_open_midday():
    midday = _ET.localize(datetime(2026, 5, 11, 12, 0))
    assert _is_market_hours(midday) is True


def test_market_open_at_close():
    close = _ET.localize(datetime(2026, 5, 11, 16, 0))
    assert _is_market_hours(close) is True


def test_market_closed_after_close():
    after = _ET.localize(datetime(2026, 5, 11, 16, 1))
    assert _is_market_hours(after) is False


# ── Trigger hit / miss ────────────────────────────────────────────────────────


def test_above_trigger_hit():
    t = {"condition": "above", "target_price": 900.0}
    assert _is_trigger_hit(t, 900.01) is True


def test_above_trigger_exact_hit():
    t = {"condition": "above", "target_price": 900.0}
    assert _is_trigger_hit(t, 900.0) is True


def test_above_trigger_miss():
    t = {"condition": "above", "target_price": 900.0}
    assert _is_trigger_hit(t, 899.99) is False


def test_below_trigger_hit():
    t = {"condition": "below", "target_price": 800.0}
    assert _is_trigger_hit(t, 799.99) is True


def test_below_trigger_exact_hit():
    t = {"condition": "below", "target_price": 800.0}
    assert _is_trigger_hit(t, 800.0) is True


def test_below_trigger_miss():
    t = {"condition": "below", "target_price": 800.0}
    assert _is_trigger_hit(t, 800.01) is False


# ── Cooldown ──────────────────────────────────────────────────────────────────


def test_auto_disarm_trigger_never_in_cooldown():
    t = {
        "auto_disarm": True,
        "cooldown_hours": 4,
        "last_triggered_at": "2026-05-11T10:00:00Z",
    }
    now = datetime(2026, 5, 11, 11, 0, tzinfo=timezone.utc)
    assert _in_cooldown(t, now) is False


def test_never_triggered_not_in_cooldown():
    t = {"auto_disarm": False, "cooldown_hours": 4, "last_triggered_at": None}
    now = datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)
    assert _in_cooldown(t, now) is False


def test_within_cooldown_window():
    t = {
        "auto_disarm": False,
        "cooldown_hours": 4,
        "last_triggered_at": "2026-05-11T10:00:00Z",
    }
    now = datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)  # 2 hours later
    assert _in_cooldown(t, now) is True


def test_cooldown_exactly_expired():
    t = {
        "auto_disarm": False,
        "cooldown_hours": 4,
        "last_triggered_at": "2026-05-11T10:00:00Z",
    }
    now = datetime(2026, 5, 11, 14, 0, tzinfo=timezone.utc)  # exactly 4 hours later
    assert _in_cooldown(t, now) is False


def test_well_past_cooldown():
    t = {
        "auto_disarm": False,
        "cooldown_hours": 4,
        "last_triggered_at": "2026-05-11T10:00:00Z",
    }
    now = datetime(2026, 5, 11, 18, 0, tzinfo=timezone.utc)  # 8 hours later
    assert _in_cooldown(t, now) is False


# ── Crypto helpers (inlined in worker) ───────────────────────────────────────

_MASTER_KEY = "a" * 64


def test_derive_key_is_deterministic():
    assert derive_key(_MASTER_KEY, "user-abc") == derive_key(_MASTER_KEY, "user-abc")


def test_derive_key_differs_by_user():
    assert derive_key(_MASTER_KEY, "user-abc") != derive_key(_MASTER_KEY, "user-xyz")


def test_derive_key_differs_by_master_key():
    other_key = "b" * 64
    assert derive_key(_MASTER_KEY, "user-abc") != derive_key(other_key, "user-abc")


def test_decrypt_roundtrip():
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    import os as _os

    key = derive_key(_MASTER_KEY, "user-abc")
    plaintext = "NVDA breakout above resistance — thesis intact."
    nonce = _os.urandom(12)
    ciphertext = nonce + AESGCM(key).encrypt(nonce, plaintext.encode(), None)
    assert decrypt(ciphertext, key) == plaintext


def test_decrypt_wrong_key_raises():
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    import os as _os
    import pytest

    key1 = derive_key(_MASTER_KEY, "user-abc")
    key2 = derive_key(_MASTER_KEY, "user-xyz")
    nonce = _os.urandom(12)
    ciphertext = nonce + AESGCM(key1).encrypt(nonce, b"secret", None)

    with pytest.raises(Exception):
        decrypt(ciphertext, key2)


# ── Weekly digest: header window vs. data query window ───────────────────────
#
# Regression test for the bug where the email header showed a "prior calendar
# week" (Mon-Sun) label while _generate_digest actually queried a rolling
# 7-day lookback (`since = now - timedelta(days=7)`). On the real Friday 9PM
# UTC cron schedule those two windows diverged by several days. _week_label
# must describe exactly the same window the query uses.


def test_week_label_matches_rolling_seven_day_query_window():
    # Friday, mirroring the real cron schedule (.github/workflows/weekly-digest.yml)
    now = datetime(2026, 5, 15, 21, 0)  # Friday
    since = now - timedelta(days=7)  # same formula _generate_digest uses

    label = _week_label(now)

    assert since.strftime("%b %-d") in label
    assert now.strftime("%b %-d") in label


def test_week_label_is_not_prior_calendar_week():
    # The old buggy formula: now - timedelta(days=weekday + 7) .. weekday + 1
    now = datetime(2026, 5, 15, 21, 0)  # Friday, weekday() == 4
    weekday = now.weekday()
    old_week_start = (now - timedelta(days=weekday + 7)).strftime("%b %-d")
    old_week_end = (now - timedelta(days=weekday + 1)).strftime("%b %-d")

    label = _week_label(now)

    # The fixed label should reflect the rolling 7-day window (ending "now"),
    # not the old prior-Mon-through-prior-Sun calendar week.
    assert now.strftime("%b %-d") in label
    assert old_week_end not in label or old_week_end == now.strftime("%b %-d")
    assert label != f"{old_week_start} – {old_week_end}"


def test_week_label_defaults_to_datetime_now():
    # No `now` passed — should still produce a well-formed "X – Y" label.
    label = _week_label()
    assert "–" in label


# ── Daily briefing: consecutive FOMO / panic-sold streak detection ───────────
#
# Regression test for the bug where the old code summed matches anywhere in
# `recent_closed[:5]` (an occurrence count, not a true consecutive streak from
# the most recent trade backward) and hardcoded "last 5" in the alert message
# even when fewer than 5 closed trades existed in total.


def _trade(confidence_tag=None, exit_reason=None):
    return {"ticker": "TEST", "confidence_tag": confidence_tag, "exit_reason": exit_reason}


def test_consecutive_streak_counts_from_most_recent_backward():
    # Most recent first: fomo, fomo, fomo, normal, fomo
    trades = [
        _trade(confidence_tag="fomo"),
        _trade(confidence_tag="fomo"),
        _trade(confidence_tag="fomo"),
        _trade(confidence_tag="high"),
        _trade(confidence_tag="fomo"),
    ]
    assert _consecutive_streak(trades, lambda t: t.get("confidence_tag") == "fomo") == 3


def test_consecutive_streak_stops_at_first_break():
    trades = [_trade(confidence_tag="high"), _trade(confidence_tag="fomo")]
    assert _consecutive_streak(trades, lambda t: t.get("confidence_tag") == "fomo") == 0


def test_non_consecutive_fomo_trades_do_not_trigger_alert():
    # 3 recent normal trades, then 2 old FOMO trades further back. Under the
    # old "occurrences anywhere in [:5]" logic this would wrongly fire.
    recent_closed = [
        _trade(confidence_tag="high"),
        _trade(confidence_tag="high"),
        _trade(confidence_tag="high"),
        _trade(confidence_tag="fomo"),
        _trade(confidence_tag="fomo"),
    ]
    alerts = _behavioral_alerts(recent_closed)
    assert not any("FOMO" in a for a in alerts)


def test_genuinely_consecutive_fomo_streak_triggers_alert():
    recent_closed = [
        _trade(confidence_tag="fomo"),
        _trade(confidence_tag="fomo"),
        _trade(confidence_tag="high"),
    ]
    alerts = _behavioral_alerts(recent_closed)
    assert any("FOMO" in a for a in alerts)


def test_alert_message_reflects_actual_window_size_not_hardcoded_five():
    # Only 2 closed trades ever, both FOMO — message must say "last 2", not
    # a hardcoded "last 5" as before.
    recent_closed = [
        _trade(confidence_tag="fomo"),
        _trade(confidence_tag="fomo"),
    ]
    alerts = _behavioral_alerts(recent_closed)
    assert len(alerts) == 1
    assert "last 2 trades" in alerts[0]
    assert "last 5 trades" not in alerts[0]


def test_consecutive_panic_sold_streak_triggers_alert_with_correct_window():
    recent_closed = [
        _trade(exit_reason="panic_sold"),
        _trade(exit_reason="panic_sold"),
        _trade(exit_reason="panic_sold"),
        _trade(exit_reason="stop_hit"),
    ]
    alerts = _behavioral_alerts(recent_closed)
    assert len(alerts) == 1
    assert "panic-sold 3 of your last 4 trades" in alerts[0]


def test_single_trade_never_triggers_alert():
    recent_closed = [_trade(confidence_tag="fomo")]
    assert _behavioral_alerts(recent_closed) == []


# ── Bug #5: pct_move reference_price must rebase after firing ───────────────
#
# Regression test for the bug where a pct_move trigger's reference_price was
# set once at creation and never updated, so a single price move past the
# threshold would keep re-firing every cooldown window indefinitely (the %
# move was always measured from the same stale baseline). update_trigger_
# post_fire must rebase reference_price to the price at fire time so the same
# underlying (now-unmoving) price no longer registers as a fresh hit.


class _FakeQuery:
    def __init__(self, captured):
        self._captured = captured
        self._payload = None

    def update(self, payload):
        self._payload = payload
        return self

    def eq(self, *args, **kwargs):
        return self

    def execute(self):
        self._captured.append(self._payload)
        return self


class _FakeSb:
    def __init__(self):
        self.captured = []

    def table(self, name):
        return _FakeQuery(self.captured)


def test_pct_move_reference_price_rebases_after_fire():
    trigger = {
        "id": "t1",
        "trigger_type": "pct_move",
        "auto_disarm": False,
        "reference_price": 100.0,
        "threshold_pct": 5,
    }
    price = 110.0  # 10% move from the original $100 reference — fires

    assert _is_trigger_hit(trigger, price) is True

    sb = _FakeSb()
    now = datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)
    update_trigger_post_fire(sb, trigger, now, price)

    updates = sb.captured[0]
    assert updates["reference_price"] == price
    assert updates["last_triggered_at"] == now.isoformat()
    assert "is_active" not in updates  # stay-armed, cooldown-reset path only

    # Apply the update the way Supabase would, then re-check: the price hasn't
    # moved further, so this must no longer register as a fresh hit against
    # the rebased reference — before the fix it would re-fire indefinitely.
    trigger.update(updates)
    assert _is_trigger_hit(trigger, price) is False


def test_pct_move_reference_price_rebases_on_auto_disarm_path_too():
    trigger = {
        "id": "t2",
        "trigger_type": "pct_move",
        "auto_disarm": True,
        "reference_price": 50.0,
        "threshold_pct": 10,
    }
    price = 60.0  # 20% move — fires

    sb = _FakeSb()
    now = datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)
    update_trigger_post_fire(sb, trigger, now, price)

    updates = sb.captured[0]
    assert updates["reference_price"] == price
    assert updates["is_active"] is False


def test_price_level_trigger_post_fire_does_not_add_reference_price():
    trigger = {"id": "t3", "trigger_type": "price_level", "auto_disarm": True}
    sb = _FakeSb()
    now = datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)
    update_trigger_post_fire(sb, trigger, now, 42.0)

    updates = sb.captured[0]
    assert "reference_price" not in updates
    assert updates["is_active"] is False


# ── Bug #15: earnings_warning must not re-fire twice on the same day ────────
#
# Regression test for the bug where _check_earnings_warning's "reports today
# or tomorrow" window stays true across many worker runs for the same
# underlying earnings event, so a short cooldown_hours with auto_disarm=false
# could send several duplicate emails for one earnings report within that
# ~2-day window. _already_warned_today blocks any re-fire on the same
# calendar day (UTC) regardless of how short cooldown_hours is.


def test_already_warned_today_false_when_never_triggered():
    t = {"last_triggered_at": None}
    now = datetime(2026, 8, 5, 15, 0, tzinfo=timezone.utc)
    assert _already_warned_today(t, now) is False


def test_earnings_warning_blocks_same_day_refire_even_after_cooldown_expires():
    t = {
        "auto_disarm": False,
        "cooldown_hours": 1,
        "last_triggered_at": "2026-08-05T09:00:00Z",
    }
    now = datetime(2026, 8, 5, 15, 0, tzinfo=timezone.utc)  # 6h later

    # Short cooldown has expired, so _in_cooldown alone would allow a refire...
    assert _in_cooldown(t, now) is False
    # ...but the same-calendar-day guard must still block it.
    assert _already_warned_today(t, now) is True


def test_earnings_warning_allows_refire_on_a_new_calendar_day():
    t = {
        "auto_disarm": False,
        "cooldown_hours": 1,
        "last_triggered_at": "2026-08-05T09:00:00Z",
    }
    now = datetime(2026, 8, 6, 9, 0, tzinfo=timezone.utc)  # next calendar day
    assert _already_warned_today(t, now) is False


def test_already_warned_today_handles_naive_last_triggered_at():
    t = {"last_triggered_at": "2026-08-05T09:00:00"}  # no offset
    now = datetime(2026, 8, 5, 15, 0, tzinfo=timezone.utc)
    assert _already_warned_today(t, now) is True


# ── DST-safe send windows (daily briefing / weekly digest) ────────────────────
# A fixed UTC cron can't track US DST, so the workflow fires at two UTC
# offsets bracketing the transition; these guards pick whichever is actually
# correct for "now" and reject the other, instead of sending an hour off for
# months at a time (or, without a guard at all, sending twice every run).


def test_daily_briefing_sends_at_8am_edt_summer():
    now = _ET.localize(datetime(2026, 7, 15, 8, 5))  # EDT period
    assert _daily_in_send_window(8, now=now) is True


def test_daily_briefing_rejects_9am_edt_summer():
    # This was the actual old-cron bug: 13:00 UTC = 9 AM EDT, not 8 AM.
    now = _ET.localize(datetime(2026, 7, 15, 9, 5))
    assert _daily_in_send_window(8, now=now) is False


def test_daily_briefing_sends_at_8am_est_winter():
    now = _ET.localize(datetime(2026, 1, 15, 8, 5))  # EST period
    assert _daily_in_send_window(8, now=now) is True


def test_daily_briefing_rejects_far_outside_window():
    now = _ET.localize(datetime(2026, 7, 15, 14, 0))
    assert _daily_in_send_window(8, now=now) is False


def test_weekly_digest_sends_friday_5pm_edt_summer():
    now = _ET.localize(datetime(2026, 7, 17, 17, 5))  # a Friday, EDT period
    assert _weekly_in_send_window(4, 17, now=now) is True


def test_weekly_digest_sends_friday_5pm_est_winter():
    now = _ET.localize(datetime(2026, 1, 16, 17, 5))  # a Friday, EST period
    assert _weekly_in_send_window(4, 17, now=now) is True


def test_weekly_digest_rejects_4pm_est_winter():
    # This was the actual old-cron bug: 21:00 UTC = 4 PM EST, not 5 PM.
    now = _ET.localize(datetime(2026, 1, 16, 16, 5))
    assert _weekly_in_send_window(4, 17, now=now) is False


def test_weekly_digest_rejects_wrong_weekday():
    now = _ET.localize(datetime(2026, 7, 16, 17, 5))  # Thursday, right time
    assert _weekly_in_send_window(4, 17, now=now) is False


# ── daily briefing: briefing_enabled opt-out ───────────────────────────────────
# The Settings page toggle only ever wrote to Supabase user_metadata — the
# worker never read it, so switching the toggle off had zero effect on
# whether the user kept getting emailed.


class _FakeWatchlistQuery:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *a, **k):
        return self

    def in_(self, *a, **k):
        return self

    def execute(self):
        return SimpleNamespace(data=self._rows)


class _FakeAuthAdmin:
    def __init__(self, users_by_id):
        self._users = users_by_id

    def get_user_by_id(self, uid):
        return self._users[uid]


class _FakeBriefingSb:
    def __init__(self, watchlist_rows, users_by_id):
        self._watchlist_rows = watchlist_rows
        self.auth = SimpleNamespace(admin=_FakeAuthAdmin(users_by_id))

    def table(self, name):
        assert name == "watchlist_entries"
        return _FakeWatchlistQuery(self._watchlist_rows)


def _fake_user(email, metadata=None):
    return SimpleNamespace(
        user=SimpleNamespace(email=email, user_metadata=metadata or {})
    )


def test_get_active_users_excludes_briefing_disabled(monkeypatch):
    import worker.daily_briefing as db

    users_by_id = {
        "u1": _fake_user("keeps@example.com", {"briefing_enabled": True}),
        "u2": _fake_user("opted-out@example.com", {"briefing_enabled": False}),
        "u3": _fake_user("unset@example.com", {}),  # never toggled — must still send
    }
    monkeypatch.setattr(
        db,
        "sb",
        _FakeBriefingSb(
            watchlist_rows=[{"user_id": "u1"}, {"user_id": "u2"}, {"user_id": "u3"}],
            users_by_id=users_by_id,
        ),
    )

    users = asyncio.run(db._get_active_users())
    emails = {u["email"] for u in users}
    assert emails == {"keeps@example.com", "unset@example.com"}
    assert "opted-out@example.com" not in emails


# ── Idempotency guard: workflow_dispatch re-runs must not double-send ─────────
#
# The _in_send_window gate above only protects the two scheduled dual-cron
# triggers from double-sending across the DST transition. A manual
# workflow_dispatch re-run (e.g. to retry after a partial failure) bypasses
# that gate entirely by design, so without a separate idempotency check it
# would always re-send to every subscriber. These guards use a
# `system_config` row (the same table/pattern trigger_worker.py already uses
# for `last_run_at` bookkeeping) to remember the last successful send.


class _FakeSystemConfigQuery:
    """Fake for `.table("system_config").select(...).eq(...).single().execute()`
    and `.upsert(...).execute()`, backed by a plain dict the test controls."""

    def __init__(self, store):
        self._store = store
        self._key_filter = None
        self._pending_upsert = None

    def select(self, *a, **k):
        return self

    def eq(self, col, val):
        assert col == "key"
        self._key_filter = val
        return self

    def single(self):
        return self

    def upsert(self, payload):
        self._pending_upsert = payload
        return self

    def execute(self):
        if self._pending_upsert is not None:
            self._store[self._pending_upsert["key"]] = self._pending_upsert["value"]
            return SimpleNamespace(data=self._pending_upsert)
        if self._key_filter in self._store:
            return SimpleNamespace(data={"value": self._store[self._key_filter]})
        raise Exception(f"no system_config row for key={self._key_filter!r}")


class _FakeSystemConfigSb:
    def __init__(self, initial=None):
        self.store = dict(initial or {})

    def table(self, name):
        assert name == "system_config"
        return _FakeSystemConfigQuery(self.store)


def test_daily_briefing_already_sent_false_when_no_row(monkeypatch):
    import worker.daily_briefing as db

    monkeypatch.setattr(db, "sb", _FakeSystemConfigSb())
    now_et = _ET.localize(datetime(2026, 8, 5, 8, 5))
    assert db._daily_briefing_already_sent(now_et) is False


def test_daily_briefing_already_sent_true_for_same_date(monkeypatch):
    import worker.daily_briefing as db

    monkeypatch.setattr(
        db,
        "sb",
        _FakeSystemConfigSb({"daily_briefing_last_sent_date": "2026-08-05"}),
    )
    now_et = _ET.localize(datetime(2026, 8, 5, 8, 5))
    assert db._daily_briefing_already_sent(now_et) is True


def test_daily_briefing_already_sent_false_for_different_date(monkeypatch):
    import worker.daily_briefing as db

    monkeypatch.setattr(
        db,
        "sb",
        _FakeSystemConfigSb({"daily_briefing_last_sent_date": "2026-08-04"}),
    )
    now_et = _ET.localize(datetime(2026, 8, 5, 8, 5))
    assert db._daily_briefing_already_sent(now_et) is False


def test_record_daily_briefing_sent_writes_todays_et_date(monkeypatch):
    import worker.daily_briefing as db

    fake = _FakeSystemConfigSb()
    monkeypatch.setattr(db, "sb", fake)
    now_et = _ET.localize(datetime(2026, 8, 5, 8, 5))
    db._record_daily_briefing_sent(now_et)
    assert fake.store["daily_briefing_last_sent_date"] == "2026-08-05"


def test_daily_briefing_main_skips_duplicate_send_on_workflow_dispatch_rerun(
    monkeypatch,
):
    """Regression test: without the idempotency guard, a manual
    workflow_dispatch re-run after the scheduled 8 AM run already fired would
    bypass _in_send_window entirely and re-email every subscriber."""
    import worker.daily_briefing as db

    monkeypatch.setenv("GITHUB_EVENT_NAME", "workflow_dispatch")
    monkeypatch.setattr(
        db,
        "sb",
        _FakeSystemConfigSb({"daily_briefing_last_sent_date": datetime.now(_ET).date().isoformat()}),
    )
    monkeypatch.setattr(db, "RESEND_API_KEY", "fake-key")

    def _fail_if_called(*a, **k):
        raise AssertionError("Emails.send must not be called on a same-day duplicate rerun")

    monkeypatch.setattr(db.resend.Emails, "send", _fail_if_called)

    asyncio.run(db.main())


# ── Weekly digest: same idempotency guard, keyed by ISO year+week ─────────────


def test_weekly_digest_already_sent_false_when_no_row(monkeypatch):
    import worker.weekly_digest as wd

    monkeypatch.setattr(wd, "sb", _FakeSystemConfigSb())
    now_et = _ET.localize(datetime(2026, 7, 17, 17, 5))  # a Friday
    assert wd._weekly_digest_already_sent(now_et) is False


def test_weekly_digest_already_sent_true_for_same_iso_week(monkeypatch):
    import worker.weekly_digest as wd

    now_et = _ET.localize(datetime(2026, 7, 17, 17, 5))  # a Friday
    iso_year, iso_week, _ = now_et.isocalendar()
    monkeypatch.setattr(
        wd,
        "sb",
        _FakeSystemConfigSb(
            {"weekly_digest_last_sent_week": f"{iso_year}-W{iso_week:02d}"}
        ),
    )
    # A re-run later the same ISO week (Mon–Sun) — e.g. the Sunday after the
    # Friday send — must still count as a duplicate.
    later_same_week = _ET.localize(datetime(2026, 7, 19, 10, 0))
    assert later_same_week.isocalendar()[:2] == (iso_year, iso_week)
    assert wd._weekly_digest_already_sent(later_same_week) is True


def test_weekly_digest_already_sent_false_for_different_iso_week(monkeypatch):
    import worker.weekly_digest as wd

    monkeypatch.setattr(
        wd, "sb", _FakeSystemConfigSb({"weekly_digest_last_sent_week": "2026-W28"})
    )
    now_et = _ET.localize(datetime(2026, 7, 17, 17, 5))  # a different ISO week
    assert wd._weekly_digest_already_sent(now_et) is False


def test_record_weekly_digest_sent_writes_iso_year_week(monkeypatch):
    import worker.weekly_digest as wd

    fake = _FakeSystemConfigSb()
    monkeypatch.setattr(wd, "sb", fake)
    now_et = _ET.localize(datetime(2026, 7, 17, 17, 5))
    wd._record_weekly_digest_sent(now_et)
    iso_year, iso_week, _ = now_et.isocalendar()
    assert fake.store["weekly_digest_last_sent_week"] == f"{iso_year}-W{iso_week:02d}"


def test_weekly_digest_main_skips_duplicate_send_on_workflow_dispatch_rerun(
    monkeypatch,
):
    """Regression test: without the idempotency guard, a manual
    workflow_dispatch re-run within the same ISO week the digest already sent
    would bypass _in_send_window entirely and re-email every subscriber."""
    import worker.weekly_digest as wd

    monkeypatch.setenv("GITHUB_EVENT_NAME", "workflow_dispatch")
    now_et = datetime.now(_ET)
    iso_year, iso_week, _ = now_et.isocalendar()
    monkeypatch.setattr(
        wd,
        "sb",
        _FakeSystemConfigSb(
            {"weekly_digest_last_sent_week": f"{iso_year}-W{iso_week:02d}"}
        ),
    )
    monkeypatch.setattr(wd, "RESEND_API_KEY", "fake-key")

    def _fail_if_called(*a, **k):
        raise AssertionError("Emails.send must not be called on a same-week duplicate rerun")

    monkeypatch.setattr(wd.resend.Emails, "send", _fail_if_called)

    asyncio.run(wd.main())
