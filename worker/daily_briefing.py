#!/usr/bin/env python3
"""
Daily Briefing Worker

Runs every weekday morning at 8 AM ET via GitHub Actions.
Generates a personalized morning briefing for each active user and sends via email.
"""

import asyncio
import os
from datetime import datetime

import httpx
import resend
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
POLYGON_API_KEY = os.environ.get("POLYGON_API_KEY", "")
FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
# Rolling alias, not a dated snapshot — Google deprecates dated model IDs
# (gemini-2.0-flash-lite, etc.) without warning; override via env if this ever moves.
GEMINI_MODEL_LITE = os.environ.get("GEMINI_MODEL_LITE", "gemini-flash-lite-latest")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM = os.environ.get("RESEND_FROM_EMAIL", "briefing@tradrnotebook.app")

resend.api_key = RESEND_API_KEY

SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
if SENTRY_DSN:
    import sentry_sdk
    sentry_sdk.init(dsn=SENTRY_DSN, traces_sample_rate=0.0, send_default_pii=False)

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def _fmt_pct(pct: float) -> str:
    return f"+{pct:.1f}%" if pct > 0 else f"{pct:.1f}%"


def _build_email(user_email: str, briefing: dict) -> str:
    date_str = datetime.now().strftime("%A, %B %-d")
    near = briefing.get("near_triggers", [])
    earnings = briefing.get("earnings_today", [])
    movers = briefing.get("overnight_movers", [])
    insight = briefing.get("coaching_insight", "")
    tickers = briefing.get("tickers_watched", [])
    behavioral = briefing.get("behavioral_alerts", [])

    near_html = (
        "".join(
            f"<li><strong>{n['ticker']}</strong> — {n['level_type'].replace('_', ' ')} "
            f"${n['level']:.2f} ({n['pct_away']:.1f}% away, current ${n['current_price']:.2f})</li>"
            for n in near
        )
        or "<li>No setups near trigger levels today.</li>"
    )

    earnings_html = (
        "".join(
            f"<li><strong>{e['ticker']}</strong> — reports {e.get('time', 'today')}</li>"
            for e in earnings
        )
        or "<li>No earnings today for your watched tickers.</li>"
    )

    movers_html = (
        "".join(
            f"<li><strong>{m['ticker']}</strong> {_fmt_pct(m['change_pct'])} "
            f"(entry ${m['entry_price']:.2f} → ${m['current_price']:.2f})</li>"
            for m in movers
        )
        or "<li>No significant moves overnight.</li>"
    )

    return f"""
<html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1e293b;">
<div style="padding:24px 0 8px">
  <div style="display:inline-block;border:1.5px solid #1a7a4a;border-radius:10px;padding:4px 10px;
              font-weight:800;font-size:13px;color:#1a7a4a;letter-spacing:-0.3px;">tN</div>
</div>
<h1 style="font-size:20px;font-weight:700;margin:16px 0 4px">Good morning</h1>
<p style="color:#64748b;font-size:13px;margin:0 0 24px">{date_str} · Watching: {
        ", ".join(tickers)
    }</p>

<h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
            color:#94a3b8;margin:0 0 8px">Near Trigger</h2>
<ul style="margin:0 0 20px;padding-left:18px;font-size:14px;line-height:1.7">{
        near_html
    }</ul>

<h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
            color:#94a3b8;margin:0 0 8px">Earnings Today</h2>
<ul style="margin:0 0 20px;padding-left:18px;font-size:14px;line-height:1.7">{
        earnings_html
    }</ul>

<h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
            color:#94a3b8;margin:0 0 8px">Overnight Movers</h2>
<ul style="margin:0 0 20px;padding-left:18px;font-size:14px;line-height:1.7">{
        movers_html
    }</ul>

{
        "".join(
            f'''<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;margin-bottom:12px">
  <p style="font-size:12px;font-weight:700;color:#c2410c;margin:0 0 6px">⚠ BEHAVIORAL ALERT</p>
  <p style="font-size:14px;line-height:1.6;margin:0;color:#1e293b">{alert}</p>
</div>'''
            for alert in behavioral
        )
    }

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


async def _generate_briefing(user_id: str) -> dict:
    """Call the briefing logic directly (mirrors /api/briefing but without HTTP round-trip)."""
    from cryptography.hazmat.primitives import hashes  # noqa: F401 — ensure crypto available

    entries = (
        sb.table("watchlist_entries")
        .select("ticker,target_price,stop_price,status")
        .eq("user_id", user_id)
        .in_("status", ["watching", "active_trade"])
        .execute()
        .data
        or []
    )
    tickers = list({e["ticker"] for e in entries})
    if not tickers:
        return {"tickers_watched": []}

    # Prices
    prices: dict[str, float] = {}
    if POLYGON_API_KEY and tickers:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    "https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers",
                    params={"tickers": ",".join(tickers), "apiKey": POLYGON_API_KEY},
                )
            if r.status_code == 200:
                prices = {
                    item["ticker"]: item["day"]["c"]
                    for item in r.json().get("tickers", [])
                    if item.get("day", {}).get("c")
                }
        except Exception:
            pass

    # Earnings
    earnings: list[dict] = []
    if FINNHUB_API_KEY:
        today = datetime.now().strftime("%Y-%m-%d")
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.get(
                    "https://finnhub.io/api/v1/calendar/earnings",
                    params={"from": today, "to": today, "token": FINNHUB_API_KEY},
                )
            if r.status_code == 200:
                watched = set(tickers)
                earnings = [
                    {"ticker": e["symbol"], "time": e.get("hour", "unknown")}
                    for e in r.json().get("earningsCalendar", [])
                    if e.get("symbol") in watched
                ]
        except Exception:
            pass

    # Near triggers
    near_triggers = []
    for e in entries:
        price = prices.get(e["ticker"])
        if not price:
            continue
        for key in ("target_price", "stop_price"):
            level = e.get(key)
            if level and level > 0:
                pct_away = abs(price - level) / level * 100
                if pct_away <= 3.0:
                    near_triggers.append(
                        {
                            "ticker": e["ticker"],
                            "level_type": key,
                            "level": level,
                            "current_price": price,
                            "pct_away": round(pct_away, 2),
                        }
                    )

    # Overnight movers
    open_trades = (
        sb.table("trades")
        .select("ticker,entry_price")
        .eq("user_id", user_id)
        .eq("status", "open")
        .execute()
        .data
        or []
    )
    overnight_movers = []
    for t in open_trades:
        price = prices.get(t["ticker"])
        if price and t.get("entry_price"):
            change_pct = (price - t["entry_price"]) / t["entry_price"] * 100
            if abs(change_pct) >= 2.0:
                overnight_movers.append(
                    {
                        "ticker": t["ticker"],
                        "entry_price": t["entry_price"],
                        "current_price": price,
                        "change_pct": round(change_pct, 2),
                    }
                )

    # Behavioral flags
    behavioral_alerts: list[str] = []
    recent_closed = (
        sb.table("trades")
        .select("ticker,confidence_tag,exit_reason,return_pct")
        .eq("user_id", user_id)
        .eq("status", "closed")
        .order("closed_at", desc=True)
        .limit(10)
        .execute()
        .data
        or []
    )
    if len(recent_closed) >= 2:
        fomo_run = sum(
            1
            for t in recent_closed[:5]
            if t.get("confidence_tag") == "fomo"
        )
        panic_run = sum(
            1
            for t in recent_closed[:5]
            if t.get("exit_reason") == "panic_sold"
        )
        if fomo_run >= 2:
            behavioral_alerts.append(
                f"You've entered {fomo_run} of your last 5 trades on FOMO. "
                "Review whether each setup met your original criteria before entering today."
            )
        if panic_run >= 2:
            behavioral_alerts.append(
                f"You've panic-sold {panic_run} of your last 5 trades. "
                "Consider setting hard stops in advance so emotion doesn't drive your exits."
            )

    # Coaching insight
    insight = None
    if GEMINI_API_KEY:
        recent_trades = recent_closed
        trades_str = (
            "\n".join(
                f"- {t['ticker']}: {t['confidence_tag']}, {t['exit_reason'] or 'n/a'}, {t['return_pct']:+.1f}%"
                for t in recent_trades
                if t.get("return_pct") is not None
            )
            or "No recent closed trades."
        )

        near_str = (
            ", ".join(
                f"{n['ticker']} ({n['pct_away']:.1f}% away)" for n in near_triggers
            )
            or "none"
        )
        earn_str = ", ".join(e["ticker"] for e in earnings) or "none"
        movers_str = (
            ", ".join(
                f"{m['ticker']} {m['change_pct']:+.1f}%" for m in overnight_movers
            )
            or "none"
        )

        prompt = f"""You are a trading coach. Write ONE specific coaching insight (2 sentences) for this trader's morning briefing.

Near triggers: {near_str}
Earnings today: {earn_str}
Overnight movers: {movers_str}
Recent trades:
{trades_str}

Be specific about a pattern you see. No generic advice."""

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
                insight = r.json()["candidates"][0]["content"]["parts"][0][
                    "text"
                ].strip()
        except Exception:
            pass

    return {
        "tickers_watched": tickers,
        "near_triggers": near_triggers,
        "earnings_today": earnings,
        "overnight_movers": overnight_movers,
        "coaching_insight": insight,
        "behavioral_alerts": behavioral_alerts,
    }


async def main() -> None:
    print(
        f"[briefing] Starting daily briefing — {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    )

    if not RESEND_API_KEY:
        print("[briefing] RESEND_API_KEY not set — skipping email delivery")
        return

    users = await _get_active_users()
    print(f"[briefing] {len(users)} active user(s)")

    for user in users:
        print(f"[briefing] Generating for {user['email']}")
        try:
            briefing = await _generate_briefing(user["id"])
            if not briefing.get("tickers_watched"):
                print("  [briefing] No active tickers — skipping")
                continue

            html = _build_email(user["email"], briefing)
            resend.Emails.send(
                {
                    "from": RESEND_FROM,
                    "to": user["email"],
                    "subject": f"tradrNotebook — Morning Briefing {datetime.now().strftime('%b %-d')}",
                    "html": html,
                }
            )
            print(f"  [briefing] Sent to {user['email']}")
        except Exception as exc:
            print(f"  [briefing] Failed for {user['email']}: {exc}")

    print("[briefing] Done")


if __name__ == "__main__":
    asyncio.run(main())
