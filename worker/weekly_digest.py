#!/usr/bin/env python3
"""
Weekly Digest Worker

Runs every Friday at 9 PM UTC (5 PM ET) via GitHub Actions.
Generates a weekly performance digest for each active user and sends via email.
"""

import asyncio
import os
from datetime import datetime, timedelta, timezone

import httpx
import pytz
import resend
import sentry_sdk
from supabase import create_client

ET = pytz.timezone("America/New_York")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
# Rolling alias, not a dated snapshot — Google deprecates dated model IDs
# (gemini-2.0-flash-lite, etc.) without warning; override via env if this ever moves.
GEMINI_MODEL_LITE = os.environ.get("GEMINI_MODEL_LITE", "gemini-flash-lite-latest")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM = os.environ.get("RESEND_FROM_EMAIL", "briefing@tradrnotebook.app")
SENTRY_DSN = os.environ.get("SENTRY_DSN", "")

if SENTRY_DSN:
    sentry_sdk.init(dsn=SENTRY_DSN)

resend.api_key = RESEND_API_KEY

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def _in_send_window(
    target_weekday: int,
    target_hour: int,
    tolerance_minutes: int = 20,
    *,
    now: datetime | None = None,
) -> bool:
    """True if it's currently within `tolerance_minutes` of `target_hour`:00
    America/New_York time on `target_weekday` (Monday=0 .. Sunday=6).

    GitHub Actions cron is fixed UTC with no DST awareness, so the workflow
    schedules two triggers bracketing the DST transition (e.g. 20:00 and
    21:00 UTC for a Friday 5 PM ET target). This picks whichever one is
    actually correct right now and no-ops the other, instead of silently
    sending an hour early/late for months at a time.

    `now` is an injection point for tests; production always omits it.
    """
    now_et = (now or datetime.now(ET)).astimezone(ET)
    if now_et.weekday() != target_weekday:
        return False
    target = now_et.replace(hour=target_hour, minute=0, second=0, microsecond=0)
    return abs((now_et - target).total_seconds()) <= tolerance_minutes * 60


def _weekly_digest_already_sent(now_et: datetime) -> bool:
    """True if a digest has already been sent this ISO week (America/New_York).

    The send-window guard above only protects the two scheduled dual-cron
    triggers from double-sending across the DST transition; a manual
    workflow_dispatch re-run bypasses that guard entirely (by design, so
    reruns work outside the window) and would otherwise re-send to every
    subscriber. This checks the `system_config` bookkeeping row instead.
    """
    try:
        result = (
            sb.table("system_config")
            .select("value")
            .eq("key", "weekly_digest_last_sent_week")
            .single()
            .execute()
        )
        iso_year, iso_week, _ = now_et.isocalendar()
        return result.data["value"] == f"{iso_year}-W{iso_week:02d}"
    except Exception:
        return False


def _record_weekly_digest_sent(now_et: datetime) -> None:
    iso_year, iso_week, _ = now_et.isocalendar()
    try:
        sb.table("system_config").upsert(
            {"key": "weekly_digest_last_sent_week", "value": f"{iso_year}-W{iso_week:02d}"}
        ).execute()
    except Exception:
        pass


def _fmt_pct(pct: float) -> str:
    return f"+{pct:.1f}%" if pct > 0 else f"{pct:.1f}%"


def _week_label(now: datetime | None = None) -> str:
    """Label for the rolling 7-day window used by _generate_digest's `since` query.

    Must stay in sync with the lookback there (`now - timedelta(days=7)`) so the
    email header always describes exactly the window the stats were computed over.
    """
    now = now or datetime.now()
    window_start = now - timedelta(days=7)
    return f"{window_start.strftime('%b %-d')} – {now.strftime('%b %-d')}"


def _build_email(user_email: str, digest: dict) -> str:
    now = datetime.now()
    week_label = _week_label(now)

    total_closed = digest.get("total_closed", 0)
    wins = digest.get("wins", 0)
    win_rate = digest.get("win_rate", 0.0)
    total_return_pct = digest.get("total_return_pct", 0.0)
    best = digest.get("best_trade")
    worst = digest.get("worst_trade")
    open_count = digest.get("open_trades", 0)
    insight = digest.get("coaching_insight", "")

    best_html = (
        f"<strong>{best['ticker']}</strong> {_fmt_pct(best['return_pct'])}" if best else "—"
    )
    worst_html = (
        f"<strong>{worst['ticker']}</strong> {_fmt_pct(worst['return_pct'])}" if worst else "—"
    )

    return f"""
<html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1e293b;">
<div style="padding:24px 0 8px">
  <div style="display:inline-block;border:1.5px solid #1a7a4a;border-radius:10px;padding:4px 10px;
              font-weight:800;font-size:13px;color:#1a7a4a;letter-spacing:-0.3px;">tN</div>
</div>
<h1 style="font-size:20px;font-weight:700;margin:16px 0 4px">Weekly Digest</h1>
<p style="color:#64748b;font-size:13px;margin:0 0 24px">{week_label}</p>

<h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
            color:#94a3b8;margin:0 0 8px">Weekly Summary</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
  <tr style="border-bottom:1px solid #f1f5f9">
    <td style="padding:8px 0;color:#64748b">Trades Closed</td>
    <td style="padding:8px 0;text-align:right;font-weight:600">{total_closed}</td>
  </tr>
  <tr style="border-bottom:1px solid #f1f5f9">
    <td style="padding:8px 0;color:#64748b">Wins</td>
    <td style="padding:8px 0;text-align:right;font-weight:600">{wins}</td>
  </tr>
  <tr style="border-bottom:1px solid #f1f5f9">
    <td style="padding:8px 0;color:#64748b">Win Rate</td>
    <td style="padding:8px 0;text-align:right;font-weight:600">{win_rate:.1f}%</td>
  </tr>
  <tr style="border-bottom:1px solid #f1f5f9">
    <td style="padding:8px 0;color:#64748b">Total Return</td>
    <td style="padding:8px 0;text-align:right;font-weight:600">{_fmt_pct(total_return_pct)}</td>
  </tr>
  <tr style="border-bottom:1px solid #f1f5f9">
    <td style="padding:8px 0;color:#64748b">Best Trade</td>
    <td style="padding:8px 0;text-align:right">{best_html}</td>
  </tr>
  <tr style="border-bottom:1px solid #f1f5f9">
    <td style="padding:8px 0;color:#64748b">Worst Trade</td>
    <td style="padding:8px 0;text-align:right">{worst_html}</td>
  </tr>
  <tr>
    <td style="padding:8px 0;color:#64748b">Open Trades</td>
    <td style="padding:8px 0;text-align:right;font-weight:600">{open_count}</td>
  </tr>
</table>

{
    f'''<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;margin-bottom:24px">
  <p style="font-size:12px;font-weight:700;color:#16a34a;margin:0 0 6px">COACHING INSIGHT</p>
  <p style="font-size:14px;line-height:1.6;margin:0;color:#1e293b">{insight}</p>
</div>'''
    if insight
    else ""
}

<p style="font-size:11px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:16px;margin-top:8px">
  tradrNotebook · <a href="https://tradrnotebook.app" style="color:#1a7a4a">tradrnotebook.app</a>
</p>
</body></html>
"""


async def _get_active_users() -> list[dict]:
    """Return users who have active watchlist entries, with their emails."""
    result = (
        sb.table("watchlist_entries")
        .select("user_id")
        .in_("status", ["watching", "active_trade"])
        .execute()
    )
    if not result.data:
        return []
    user_ids = list({row["user_id"] for row in result.data})

    users = []
    for uid in user_ids:
        try:
            resp = sb.auth.admin.get_user_by_id(uid)
            if resp.user and resp.user.email:
                users.append({"id": uid, "email": resp.user.email})
        except Exception:
            pass
    return users


async def _generate_digest(user_id: str) -> dict:
    """Compute weekly stats and generate a coaching insight for the user."""
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    closed_trades = (
        sb.table("trades")
        .select("ticker,return_pct,confidence_tag,exit_reason")
        .eq("user_id", user_id)
        .eq("status", "closed")
        .gte("closed_at", since)
        .execute()
        .data
        or []
    )

    total_closed = len(closed_trades)
    wins = sum(1 for t in closed_trades if (t.get("return_pct") or 0) > 0)
    win_rate = (wins / total_closed * 100) if total_closed else 0.0
    total_return_pct = sum(t.get("return_pct") or 0 for t in closed_trades)

    best_trade = None
    worst_trade = None
    if closed_trades:
        with_returns = [t for t in closed_trades if t.get("return_pct") is not None]
        if with_returns:
            best = max(with_returns, key=lambda t: t["return_pct"])
            worst = min(with_returns, key=lambda t: t["return_pct"])
            best_trade = {"ticker": best["ticker"], "return_pct": best["return_pct"]}
            worst_trade = {"ticker": worst["ticker"], "return_pct": worst["return_pct"]}

    open_trades_result = (
        sb.table("trades")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("status", "open")
        .execute()
    )
    open_count = open_trades_result.count or 0

    # Coaching insight
    insight = None
    if GEMINI_API_KEY and total_closed > 0:
        trades_str = "\n".join(
            f"- {t['ticker']}: {t.get('confidence_tag', 'n/a')}, "
            f"{t.get('exit_reason') or 'n/a'}, {t['return_pct']:+.1f}%"
            for t in closed_trades
            if t.get("return_pct") is not None
        ) or "No closed trades this week."

        prompt = f"""You are a trading coach. Write a 2-sentence coaching insight summarizing this trader's week.

Trades closed this week:
{trades_str}

Win rate: {win_rate:.1f}% ({wins}/{total_closed})
Total return: {total_return_pct:+.1f}%

Identify a specific pattern or behavioral tendency. Be direct and actionable."""

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                r = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL_LITE}:generateContent",
                    json={
                        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                        "generationConfig": {
                            "temperature": 0.7,
                            "maxOutputTokens": 150,
                        },
                    },
                    headers={"x-goog-api-key": GEMINI_API_KEY},
                )
            if r.status_code == 200:
                insight = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        except Exception:
            pass

    return {
        "total_closed": total_closed,
        "wins": wins,
        "win_rate": win_rate,
        "total_return_pct": total_return_pct,
        "best_trade": best_trade,
        "worst_trade": worst_trade,
        "open_trades": open_count,
        "coaching_insight": insight,
    }


async def main() -> None:
    print(
        f"[weekly-digest] Starting weekly digest — {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    )

    now_et = datetime.now(ET)

    # Manual reruns (workflow_dispatch) should still work outside the window;
    # only the scheduled dual-cron triggers need this gate. Friday=4.
    if os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch" and not _in_send_window(4, 17, now=now_et):
        print(f"[weekly-digest] Outside the Friday 5 PM ET send window (now {now_et.strftime('%a %H:%M %Z')}) — skipping")
        return

    if _weekly_digest_already_sent(now_et):
        iso_year, iso_week, _ = now_et.isocalendar()
        print(f"[weekly-digest] Already sent this week ({iso_year}-W{iso_week:02d}) — skipping duplicate run")
        return

    if not RESEND_API_KEY:
        print("[weekly-digest] RESEND_API_KEY not set — skipping email delivery")
        return

    users = await _get_active_users()
    print(f"[weekly-digest] {len(users)} active user(s)")

    subject = f"tradrNotebook — Weekly Digest {_week_label()}"

    for user in users:
        print(f"[weekly-digest] Generating for {user['email']}")
        try:
            digest = await _generate_digest(user["id"])
            html = _build_email(user["email"], digest)
            resend.Emails.send(
                {
                    "from": RESEND_FROM,
                    "to": user["email"],
                    "subject": subject,
                    "html": html,
                }
            )
            print(f"  [weekly-digest] Sent to {user['email']}")
        except Exception as exc:
            print(f"  [weekly-digest] Failed for {user['email']}: {exc}")

    _record_weekly_digest_sent(now_et)
    print("[weekly-digest] Done")


if __name__ == "__main__":
    asyncio.run(main())
