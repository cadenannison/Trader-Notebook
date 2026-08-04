#!/usr/bin/env python3
"""
Trader Notebook — Trigger Worker

Runs via GitHub Actions every 15 minutes during market hours.
Checks active price triggers and fires the insight agent + Resend email when a target is hit.
"""

import asyncio
import os
from datetime import datetime, time, timedelta, timezone

import httpx
import pytz
import resend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from supabase import create_client

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
POLYGON_API_KEY = os.environ.get("POLYGON_API_KEY", "")
FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
# Rolling aliases, not dated snapshots — Google deprecates dated model IDs
# (gemini-2.0-flash, etc.) without warning; override via env if these ever move.
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
GEMINI_MODEL_LITE = os.environ.get("GEMINI_MODEL_LITE", "gemini-flash-lite-latest")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM = os.environ.get("RESEND_FROM_EMAIL", "alerts@tradrnotebook.app")
MASTER_KEY = os.environ.get("MASTER_KEY", "")

resend.api_key = RESEND_API_KEY

SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
if SENTRY_DSN:
    import sentry_sdk
    sentry_sdk.init(dsn=SENTRY_DSN, traces_sample_rate=0.0, send_default_pii=False)

_INSIGHT_PROMPT = """\
You are a financial analyst assistant for a personal trading journal.

An alert has just triggered. Based on the trader's notes, trade history, and current news,
write a concise 2-3 sentence insight that:
1. Confirms what happened (which level was hit, or that earnings are approaching)
2. References the trader's own thesis from their notes
3. Highlights any relevant news that supports or challenges the thesis
4. If past trades on this ticker exist, briefly note whether history supports acting (e.g. "Your last 3 NVDA trades averaged +8%")

Be direct. No disclaimers. End with one clear action the trader should consider.

Ticker: {ticker}
Alert: {alert_description}
Trader notes: {notes}
Recent news: {news}
Past trades on {ticker}: {trade_history}
"""

# ── Market hours ──────────────────────────────────────────────────────────────


def _is_market_hours(now: datetime) -> bool:
    """Pure function — takes a timezone-aware datetime, returns True if NYSE is open."""
    if now.weekday() >= 5:  # Saturday=5, Sunday=6
        return False
    return time(9, 30) <= now.time() <= time(16, 0)


def is_market_open() -> bool:
    et = pytz.timezone("America/New_York")
    return _is_market_hours(datetime.now(et))


def _is_trigger_hit(trigger: dict, price: float) -> bool:
    """Return True if the current price satisfies the trigger condition."""
    t_type = trigger.get("trigger_type") or "price_level"

    if t_type == "price_level":
        target = trigger.get("target_price")
        if target is None:
            return False
        return (trigger["condition"] == "above" and price >= target) or (
            trigger["condition"] == "below" and price <= target
        )

    if t_type == "pct_move":
        # Reference is the stored baseline; fall back to target_price if not set
        ref = trigger.get("reference_price") or trigger.get("target_price")
        threshold = trigger.get("threshold_pct")
        if not ref or not threshold:
            return False
        return abs((price - ref) / ref * 100) >= threshold

    # earnings_warning is time-based, handled separately in main()
    return False


async def _check_earnings_warning(triggers: list[dict]) -> list[dict]:
    """Return subset of earnings_warning triggers whose ticker reports today or tomorrow."""
    if not FINNHUB_API_KEY:
        return []
    from datetime import timedelta

    today = datetime.now(timezone.utc)
    tomorrow = today + timedelta(days=1)
    date_from = today.strftime("%Y-%m-%d")
    date_to = tomorrow.strftime("%Y-%m-%d")

    tickers_watched = {t["ticker"] for t in triggers}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                "https://finnhub.io/api/v1/calendar/earnings",
                params={"from": date_from, "to": date_to, "token": FINNHUB_API_KEY},
            )
        if r.status_code != 200:
            return []
        reporting = {e["symbol"] for e in r.json().get("earningsCalendar", []) if e.get("symbol")}
        return [t for t in triggers if t["ticker"] in reporting & tickers_watched]
    except Exception as exc:
        print(f"  [earnings] Finnhub calendar error: {exc}")
        return []


def _in_cooldown(trigger: dict, now: datetime) -> bool:
    """Return True if a stay-armed trigger is still within its cooldown window."""
    if trigger["auto_disarm"] or not trigger.get("last_triggered_at"):
        return False
    last_str = trigger["last_triggered_at"].replace("Z", "+00:00")
    last = datetime.fromisoformat(last_str)
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return (now - last).total_seconds() / 3600 < trigger["cooldown_hours"]


# ── Crypto (inlined from server/app/crypto/keys.py) ──────────────────────────


def derive_key(master_key_hex: str, user_id: str) -> bytes:
    master_key = bytes.fromhex(master_key_hex)
    hkdf = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=user_id.encode())
    return hkdf.derive(master_key)


def decrypt(ciphertext: bytes, key: bytes) -> str:
    nonce, data = ciphertext[:12], ciphertext[12:]
    return AESGCM(key).decrypt(nonce, data, None).decode()


# ── Supabase helpers (sync) ───────────────────────────────────────────────────


def check_kill_switch(sb) -> bool:
    try:
        result = (
            sb.table("system_config")
            .select("value")
            .eq("key", "maintenance_mode")
            .single()
            .execute()
        )
        return result.data["value"] == "true"
    except Exception:
        return False


def fetch_active_triggers(sb) -> list[dict]:
    return sb.table("triggers").select("*").eq("is_active", True).execute().data


def get_user_notes(sb, ticker: str, user_id: str) -> list[str]:
    try:
        rows = (
            sb.table("notes")
            .select("encrypted_content")
            .eq("ticker", ticker.upper())
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(5)
            .execute()
            .data
        )
        key = derive_key(MASTER_KEY, user_id)
        return [decrypt(bytes.fromhex(r["encrypted_content"]), key) for r in rows]
    except Exception as exc:
        print(f"  [notes] Error fetching/decrypting: {exc}")
        return []


def get_trade_history(sb, ticker: str, user_id: str) -> str:
    """Return a short human-readable summary of closed trades for this ticker."""
    try:
        rows = (
            sb.table("trades")
            .select("entry_price,exit_price,return_pct,confidence_tag,exit_reason,closed_at")
            .eq("user_id", user_id)
            .eq("ticker", ticker.upper())
            .eq("status", "closed")
            .order("closed_at", desc=True)
            .limit(5)
            .execute()
            .data
        )
        if not rows:
            return "No prior closed trades on this ticker."
        wins = sum(1 for r in rows if (r.get("return_pct") or 0) > 0)
        avg_return = sum(r.get("return_pct") or 0 for r in rows) / len(rows)
        lines = [f"{len(rows)} closed trade(s), {wins}/{len(rows)} wins, avg return {avg_return:+.1f}%"]
        for r in rows:
            ret = f"{r['return_pct']:+.1f}%" if r.get("return_pct") is not None else "n/a"
            reason = r.get("exit_reason") or "unknown"
            date = (r.get("closed_at") or "")[:10]
            lines.append(f"  • {date} entry ${r['entry_price']} → exit ${r.get('exit_price','?')} ({ret}, {reason})")
        return "\n".join(lines)
    except Exception as exc:
        print(f"  [trades] Error fetching history for {ticker}: {exc}")
        return "Trade history unavailable."


def get_user_email(sb, user_id: str) -> str | None:
    try:
        return sb.auth.admin.get_user_by_id(user_id).user.email
    except Exception as exc:
        print(f"  [email] Could not fetch user email: {exc}")
        return None


def write_audit_log(sb, trigger_id: str, action: str, metadata: dict) -> None:
    try:
        sb.table("agent_audit_logs").insert(
            {
                "agent_id": "insight_engine_v1",
                "action": action,
                "metadata": metadata,
                "user_id": metadata.get("user_id"),
            }
        ).execute()
    except Exception as exc:
        print(f"  [audit] Failed to write log: {exc}")


def write_trigger_log(sb, trigger: dict, price: float, summary: str) -> None:
    try:
        sb.table("trigger_logs").insert(
            {
                "trigger_id": trigger["id"],
                "user_id": trigger["user_id"],
                "ticker": trigger["ticker"],
                "trigger_type": trigger.get("trigger_type") or "price_level",
                "price_at_fire": round(price, 4) if price else None,
                "summary": summary[:500] if summary else None,
            }
        ).execute()
    except Exception as exc:
        print(f"  [trigger_log] Failed to write log: {exc}")


def update_trigger_post_fire(sb, trigger: dict, now: datetime) -> None:
    if trigger["auto_disarm"]:
        sb.table("triggers").update(
            {
                "is_active": False,
                "last_triggered_at": now.isoformat(),
            }
        ).eq("id", trigger["id"]).execute()
    else:
        sb.table("triggers").update(
            {
                "last_triggered_at": now.isoformat(),
            }
        ).eq("id", trigger["id"]).execute()


def record_last_run(sb, now: datetime) -> None:
    try:
        sb.table("system_config").upsert(
            {
                "key": "last_run_at",
                "value": now.isoformat(),
            }
        ).execute()
    except Exception:
        pass


# ── Async I/O ─────────────────────────────────────────────────────────────────


async def _fetch_one_price(
    client: httpx.AsyncClient, ticker: str
) -> tuple[str, float | None]:
    if not POLYGON_API_KEY:
        return ticker, None
    try:
        r = await client.get(
            f"https://api.polygon.io/v2/aggs/ticker/{ticker}/prev",
            params={"adjusted": "true", "apiKey": POLYGON_API_KEY},
        )
        if r.status_code != 200:
            return ticker, None
        results = r.json().get("results")
        if not results:
            return ticker, None
        return ticker, float(results[0]["c"])
    except Exception as exc:
        print(f"  [polygon] Error fetching {ticker}: {exc}")
        return ticker, None


async def batch_fetch_prices(tickers: list[str]) -> dict[str, float]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        pairs = await asyncio.gather(*[_fetch_one_price(client, t) for t in tickers])
    return {ticker: price for ticker, price in pairs if price is not None}


async def get_market_news(ticker: str) -> list[str]:
    if not FINNHUB_API_KEY:
        return []
    from_date = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
    to_date = datetime.utcnow().strftime("%Y-%m-%d")
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                "https://finnhub.io/api/v1/company-news",
                params={
                    "symbol": ticker,
                    "from": from_date,
                    "to": to_date,
                    "token": FINNHUB_API_KEY,
                },
            )
        if r.status_code != 200:
            return []
        return [a["headline"] for a in r.json()[:5] if a.get("headline")]
    except Exception:
        return []


async def run_insight_agent(
    ticker: str, trigger: dict, price: float, notes: list[str], news: list[str],
    trade_history: str = "No prior closed trades on this ticker.",
) -> str:
    t_type = trigger.get("trigger_type") or "price_level"

    if t_type == "pct_move":
        ref = trigger.get("reference_price") or trigger.get("target_price") or price
        pct = abs((price - ref) / ref * 100) if ref else 0
        alert_description = f"moved {pct:.1f}% from reference ${ref:.2f} (now ${price:.2f})"
    elif t_type == "earnings_warning":
        alert_description = f"earnings report due today or tomorrow (current price ${price:.2f})"
    else:
        direction = "risen above" if trigger["condition"] == "above" else "fallen below"
        target = trigger.get("target_price") or price
        alert_description = f"price {direction} ${target:.2f} (current: ${price:.2f})"

    if not GEMINI_API_KEY:
        notes_text = notes[0][:120] if notes else "No prior notes recorded."
        news_text = news[0][:120] if news else "No recent news available."
        return (
            f"{ticker} alert: {alert_description}. "
            f"Your thesis: {notes_text}. Latest: {news_text}. "
            f"Review the position and decide whether to act or hold."
        )

    prompt = _INSIGHT_PROMPT.format(
        ticker=ticker,
        alert_description=alert_description,
        notes=" | ".join(notes[:3]) or "No notes recorded.",
        news=" | ".join(news[:3]) or "No recent news.",
        trade_history=trade_history,
    )
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.5, "maxOutputTokens": 512},
    }
    for model in [GEMINI_MODEL, GEMINI_MODEL_LITE]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                r = await client.post(
                    url, json=body, headers={"x-goog-api-key": GEMINI_API_KEY}
                )
            if r.status_code == 200:
                return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        except Exception:
            continue

    return (
        f"{ticker} has {direction} your target of ${trigger['target_price']:.2f} "
        f"(now ${price:.2f}). Review your notes and current market conditions before acting."
    )


def send_email(user_email: str | None, ticker: str, summary: str) -> None:
    if not RESEND_API_KEY or not user_email:
        print("  [email] Skipped — missing Resend key or user email")
        return
    body = (
        f"{summary}\n\n"
        "---\n"
        "This summary was generated automatically based on your notes and current news headlines.\n"
        "It is not financial advice. Verify all information before making any decisions.\n\n"
        "— tradrNotebook"
    )
    resend.Emails.send(
        {
            "from": RESEND_FROM,
            "to": [user_email],
            "subject": f"tradrNotebook: {ticker} alert triggered",
            "text": body,
        }
    )


# ── Main ──────────────────────────────────────────────────────────────────────


async def main() -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("SUPABASE_URL and SUPABASE_SERVICE_KEY are required — exiting.")
        return
    if not MASTER_KEY:
        print("MASTER_KEY is required for note decryption — exiting.")
        return

    if not is_market_open():
        print("Market is closed — exiting.")
        return

    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    if check_kill_switch(sb):
        print("Maintenance mode active — exiting.")
        return

    triggers = fetch_active_triggers(sb)
    if not triggers:
        print("No active triggers.")
        return

    # Split by trigger type
    price_triggers = [t for t in triggers if (t.get("trigger_type") or "price_level") in ("price_level", "pct_move")]
    earnings_triggers = [t for t in triggers if (t.get("trigger_type") or "price_level") == "earnings_warning"]

    tickers = list({t["ticker"] for t in triggers})
    print(
        f"Checking {len(triggers)} trigger(s) across {len(tickers)} ticker(s): {', '.join(tickers)}"
    )

    prices = await batch_fetch_prices(tickers)
    now = datetime.now(timezone.utc)

    # ── Price-level and pct_move triggers ─────────────────────────────────────
    for trigger in price_triggers:
        ticker = trigger["ticker"]
        price = prices.get(ticker)

        if price is None:
            print(f"  [{ticker}] No price data — skipping.")
            continue

        if not _is_trigger_hit(trigger, price):
            t_type = trigger.get("trigger_type") or "price_level"
            if t_type == "pct_move":
                ref = trigger.get("reference_price") or trigger.get("target_price")
                pct = abs((price - ref) / ref * 100) if ref else 0
                print(f"  [{ticker}] ${price:.2f} — {pct:.1f}% move vs {trigger.get('threshold_pct')}% threshold — no hit.")
            else:
                print(f"  [{ticker}] ${price:.2f} vs ${trigger['target_price']} {trigger['condition']} — no hit.")
            continue

        if _in_cooldown(trigger, now):
            print(f"  [{ticker}] Trigger {trigger['id']} in cooldown — skipping.")
            continue

        t_type = trigger.get("trigger_type") or "price_level"
        if t_type == "pct_move":
            ref = trigger.get("reference_price") or trigger.get("target_price")
            pct = abs((price - ref) / ref * 100) if ref else 0
            print(f"  [{ticker}] TRIGGER HIT: ${price:.2f} moved {pct:.1f}% from ${ref} (threshold {trigger.get('threshold_pct')}%)")
        else:
            print(f"  [{ticker}] TRIGGER HIT: ${price:.2f} {trigger['condition']} ${trigger['target_price']:.2f}")

        notes = get_user_notes(sb, ticker, trigger["user_id"])
        news = await get_market_news(ticker)
        trade_history = get_trade_history(sb, ticker, trigger["user_id"])
        summary = await run_insight_agent(ticker, trigger, price, notes, news, trade_history)

        write_audit_log(
            sb,
            trigger["id"],
            "insight_generated",
            {
                "ticker": ticker,
                "price": price,
                "trigger_id": trigger["id"],
                "user_id": trigger["user_id"],
                "trigger_type": t_type,
            },
        )

        user_email = get_user_email(sb, trigger["user_id"])
        send_email(user_email, ticker, summary)
        write_trigger_log(sb, trigger, price, summary)
        print(f"  [{ticker}] Email sent to {user_email}")

        update_trigger_post_fire(sb, trigger, now)
        status = "deactivated" if trigger["auto_disarm"] else "re-armed (cooldown reset)"
        print(f"  [{ticker}] Trigger {trigger['id']} {status}.")

    # ── Earnings-warning triggers ──────────────────────────────────────────────
    if earnings_triggers:
        firing_earnings = await _check_earnings_warning(earnings_triggers)
        for trigger in firing_earnings:
            ticker = trigger["ticker"]

            if _in_cooldown(trigger, now):
                print(f"  [{ticker}] Earnings trigger {trigger['id']} in cooldown — skipping.")
                continue

            print(f"  [{ticker}] EARNINGS WARNING: reports today or tomorrow")
            price = prices.get(ticker, 0.0)
            notes = get_user_notes(sb, ticker, trigger["user_id"])
            news = await get_market_news(ticker)
            trade_history = get_trade_history(sb, ticker, trigger["user_id"])

            # Earnings-specific insight prompt variant
            earnings_trigger = {**trigger, "condition": "earnings", "target_price": price}
            summary = await run_insight_agent(ticker, earnings_trigger, price, notes, news, trade_history)

            write_audit_log(
                sb,
                trigger["id"],
                "earnings_warning_fired",
                {"ticker": ticker, "price": price, "trigger_id": trigger["id"], "user_id": trigger["user_id"]},
            )

            user_email = get_user_email(sb, trigger["user_id"])
            send_email(user_email, ticker, summary)
            write_trigger_log(sb, trigger, price, summary)
            print(f"  [{ticker}] Earnings warning email sent to {user_email}")

            update_trigger_post_fire(sb, trigger, now)
            status = "deactivated" if trigger["auto_disarm"] else "re-armed"
            print(f"  [{ticker}] Trigger {trigger['id']} {status}.")

    record_last_run(sb, now)
    print("Trigger check complete.")


if __name__ == "__main__":
    asyncio.run(main())
