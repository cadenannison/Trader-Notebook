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
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM = os.environ.get("RESEND_FROM_EMAIL", "alerts@tradrnotebook.app")
MASTER_KEY = os.environ.get("MASTER_KEY", "")

resend.api_key = RESEND_API_KEY

_INSIGHT_PROMPT = """\
You are a financial analyst assistant for a personal trading journal.

A price alert has just triggered. Based on the trader's notes and current news,
write a concise 2-3 sentence insight that:
1. Confirms what happened (which level was hit, direction)
2. References the trader's own thesis from their notes
3. Highlights any relevant news that supports or challenges the thesis

Be direct. No disclaimers. End with one clear action the trader should consider.

Ticker: {ticker}
Alert: price {direction} ${trigger_price:.2f} (current: ${price:.2f})
Trader notes: {notes}
Recent news: {news}
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
    return (trigger["condition"] == "above" and price >= trigger["target_price"]) or (
        trigger["condition"] == "below" and price <= trigger["target_price"]
    )


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


def get_user_email(sb, user_id: str) -> str | None:
    try:
        return sb.auth.admin.get_user_by_id(user_id).user.email
    except Exception as exc:
        print(f"  [email] Could not fetch user email: {exc}")
        return None


def write_audit_log(sb, trigger_id: str, action: str, metadata: dict) -> None:
    try:
        sb.table("agent_audit_logs").insert({
            "agent_id": "insight_engine_v1",
            "action": action,
            "metadata": metadata,
            "user_id": metadata.get("user_id"),
        }).execute()
    except Exception as exc:
        print(f"  [audit] Failed to write log: {exc}")


def update_trigger_post_fire(sb, trigger: dict, now: datetime) -> None:
    if trigger["auto_disarm"]:
        sb.table("triggers").update({
            "is_active": False,
            "last_triggered_at": now.isoformat(),
        }).eq("id", trigger["id"]).execute()
    else:
        sb.table("triggers").update({
            "last_triggered_at": now.isoformat(),
        }).eq("id", trigger["id"]).execute()


def record_last_run(sb, now: datetime) -> None:
    try:
        sb.table("system_config").upsert({
            "key": "last_run_at",
            "value": now.isoformat(),
        }).execute()
    except Exception:
        pass


# ── Async I/O ─────────────────────────────────────────────────────────────────


async def _fetch_one_price(client: httpx.AsyncClient, ticker: str) -> tuple[str, float | None]:
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
                params={"symbol": ticker, "from": from_date, "to": to_date, "token": FINNHUB_API_KEY},
            )
        if r.status_code != 200:
            return []
        return [a["headline"] for a in r.json()[:5] if a.get("headline")]
    except Exception:
        return []


async def run_insight_agent(
    ticker: str, trigger: dict, price: float, notes: list[str], news: list[str]
) -> str:
    direction = "risen above" if trigger["condition"] == "above" else "fallen below"

    if not GEMINI_API_KEY:
        notes_text = notes[0][:120] if notes else "No prior notes recorded."
        news_text = news[0][:120] if news else "No recent news available."
        return (
            f"{ticker} has {direction} your target of ${trigger['target_price']:.2f} "
            f"(now ${price:.2f}). Your thesis: {notes_text}. Latest: {news_text}. "
            f"Review the position and decide whether to act or hold."
        )

    prompt = _INSIGHT_PROMPT.format(
        ticker=ticker,
        direction=direction,
        trigger_price=trigger["target_price"],
        price=price,
        notes=" | ".join(notes[:3]) or "No notes recorded.",
        news=" | ".join(news[:3]) or "No recent news.",
    )
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.5, "maxOutputTokens": 512},
    }
    for model in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                r = await client.post(url, json=body, headers={"x-goog-api-key": GEMINI_API_KEY})
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
    resend.Emails.send({
        "from": RESEND_FROM,
        "to": [user_email],
        "subject": f"tradrNotebook: {ticker} alert triggered",
        "text": body,
    })


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

    tickers = list({t["ticker"] for t in triggers})
    print(f"Checking {len(triggers)} trigger(s) across {len(tickers)} ticker(s): {', '.join(tickers)}")

    prices = await batch_fetch_prices(tickers)
    now = datetime.now(timezone.utc)

    for trigger in triggers:
        ticker = trigger["ticker"]
        price = prices.get(ticker)

        if price is None:
            print(f"  [{ticker}] No price data — skipping.")
            continue

        if not _is_trigger_hit(trigger, price):
            print(f"  [{ticker}] ${price:.2f} vs ${trigger['target_price']} {trigger['condition']} — no hit.")
            continue

        if _in_cooldown(trigger, now):
            print(f"  [{ticker}] Trigger {trigger['id']} in cooldown — skipping.")
            continue

        print(f"  [{ticker}] TRIGGER HIT: ${price:.2f} {trigger['condition']} ${trigger['target_price']:.2f}")

        notes = get_user_notes(sb, ticker, trigger["user_id"])
        news = await get_market_news(ticker)
        summary = await run_insight_agent(ticker, trigger, price, notes, news)

        write_audit_log(sb, trigger["id"], "insight_generated", {
            "ticker": ticker,
            "price": price,
            "trigger_id": trigger["id"],
            "user_id": trigger["user_id"],
        })

        user_email = get_user_email(sb, trigger["user_id"])
        send_email(user_email, ticker, summary)
        print(f"  [{ticker}] Email sent to {user_email}")

        update_trigger_post_fire(sb, trigger, now)
        status = "deactivated" if trigger["auto_disarm"] else "re-armed (cooldown reset)"
        print(f"  [{ticker}] Trigger {trigger['id']} {status}.")

    record_last_run(sb, now)
    print("Trigger check complete.")


if __name__ == "__main__":
    asyncio.run(main())
