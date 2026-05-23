"""
Worker logic tests.

Tests pure/extracted functions — no network calls, no Supabase, no Resend.
Covers: market hours, trigger hit/miss, cooldown, crypto helpers.
"""

import os
import sys
from datetime import datetime, timezone

import pytz

# Worker reads env vars at import time — provide safe defaults
os.environ.setdefault("MASTER_KEY", "a" * 64)
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from worker.trigger_worker import (  # noqa: E402
    _in_cooldown,
    _is_market_hours,
    _is_trigger_hit,
    decrypt,
    derive_key,
)

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
