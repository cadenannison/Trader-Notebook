#!/usr/bin/env python3
"""
Trader Notebook — Trigger Worker

Runs on a schedule via GitHub Actions every 15 minutes during market hours.
Checks active price triggers and invokes the insight agent when a target is hit.
All external service calls are stubbed — replace TODO blocks to go live.
"""

import asyncio
import os
import sys
from datetime import datetime, time, timezone

import pytz

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
POLYGON_API_KEY = os.environ.get("POLYGON_API_KEY", "")
NEWSAPI_KEY = os.environ.get("NEWSAPI_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
MASTER_KEY = os.environ.get("MASTER_KEY", "a" * 64)

# ── Market hours ──────────────────────────────────────────────────────────────


def is_market_open() -> bool:
    et = pytz.timezone("America/New_York")
    now = datetime.now(et)
    if now.weekday() >= 5:  # Saturday=5, Sunday=6
        return False
    return time(9, 30) <= now.time() <= time(16, 0)


# ── Data providers (stubbed) ──────────────────────────────────────────────────


def fetch_active_triggers() -> list[dict]:
    """Fetch all active triggers for all users.

    TODO:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        return supabase.table("triggers").select("*").eq("is_active", True).execute().data
    """
    print("[MOCK] Fetching active triggers from Supabase...")
    return [
        {
            "id": "t1",
            "user_id": "u1",
            "ticker": "NVDA",
            "target_price": 875.00,
            "condition": "above",
            "auto_disarm": True,
            "cooldown_hours": 4,
            "last_triggered_at": None,
        },
    ]


async def batch_fetch_prices(tickers: list[str]) -> dict[str, float]:
    """Fetch current prices for a list of tickers in a single API call.

    TODO:
        snapshot_url = f"https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers"
        response = await httpx.get(snapshot_url, params={"tickers": ",".join(tickers),
            "apiKey": POLYGON_API_KEY})
        return {item["ticker"]: item["day"]["c"] for item in response.json()["tickers"]}
    """
    print(f"[MOCK] Fetching prices for {tickers} from Polygon.io...")
    mock = {"NVDA": 876.00, "AAPL": 182.00, "VGT": 428.00, "MSFT": 415.00}
    return {t: mock.get(t, 100.0) for t in tickers}


async def run_insight_agent(trigger: dict, price: float) -> str:
    """Generate an AI insight for a triggered alert.

    TODO:
        from pydantic_ai import Agent
        from pydantic_ai.models.gemini import GeminiModel
        agent = Agent(model=GeminiModel("gemini-2.0-flash"), system_prompt=PROMPT)
        notes = get_user_notes(trigger["ticker"], trigger["user_id"])
        news  = get_market_news(trigger["ticker"])
        result = await agent.run(f"Notes: {notes}\nNews: {news}\nTrigger: {trigger}")
        return result.data
    """
    print(f"[MOCK] Running insight agent for {trigger['ticker']}...")
    direction = "risen above" if trigger["condition"] == "above" else "fallen below"
    return (
        f"{trigger['ticker']} has {direction} your target of ${trigger['target_price']}. "
        f"Current price: ${price:.2f}. Review your notes and current news before acting.\n\n"
        f"This summary was generated automatically and is not financial advice."
    )


async def send_email(user_id: str, ticker: str, summary: str) -> None:
    """Send insight email via Resend.

    TODO:
        import resend
        resend.api_key = RESEND_API_KEY
        resend.Emails.send({
            "from": "insights@yourdomain.com",
            "to": get_user_email(user_id),
            "subject": f"Trader Notebook: {ticker} trigger fired",
            "text": summary,
        })
    """
    print(f"[MOCK] Sending email to {user_id}: {summary[:80]}...")


def write_audit_log(trigger_id: str, action: str, metadata: dict) -> None:
    """Write an audit log entry before the user sees the insight.

    TODO:
        supabase.table("agent_audit_logs").insert({
            "agent_id": "insight_engine_v1",
            "action": action,
            "metadata": metadata,
            "user_id": metadata.get("user_id"),
        }).execute()
    """
    print(f"[AUDIT] {action} — trigger={trigger_id} meta={metadata}")


def update_trigger_post_fire(supabase_or_none, trigger: dict, now: datetime) -> None:
    """Deactivate or record last_triggered_at after a trigger fires.

    TODO:
        if trigger["auto_disarm"]:
            supabase.table("triggers").update({"is_active": False,
                "last_triggered_at": now.isoformat()}).eq("id", trigger["id"]).execute()
        else:
            supabase.table("triggers").update({"last_triggered_at": now.isoformat()
                }).eq("id", trigger["id"]).execute()
    """
    if trigger["auto_disarm"]:
        print(f"[MOCK] Deactivating trigger {trigger['id']}")
    else:
        print(f"[MOCK] Recording last_triggered_at for trigger {trigger['id']}")


def check_kill_switch() -> bool:
    """Return True if maintenance_mode is active.

    TODO:
        result = supabase.table("system_config").select("value")
            .eq("key", "maintenance_mode").single().execute()
        return result.data["value"] == "true"
    """
    return False


# ── Main ──────────────────────────────────────────────────────────────────────


async def main() -> None:
    if not is_market_open():
        print("Market is closed — exiting.")
        return

    if check_kill_switch():
        print("Maintenance mode active — exiting.")
        return

    triggers = fetch_active_triggers()
    if not triggers:
        print("No active triggers.")
        return

    tickers = list({t["ticker"] for t in triggers})
    prices = await batch_fetch_prices(tickers)
    now = datetime.now(timezone.utc)

    for trigger in triggers:
        price = prices.get(trigger["ticker"])
        if price is None:
            print(f"No price data for {trigger['ticker']} — skipping.")
            continue

        hit = (
            trigger["condition"] == "above" and price >= trigger["target_price"]
        ) or (
            trigger["condition"] == "below" and price <= trigger["target_price"]
        )
        if not hit:
            continue

        # Cooldown check for stay-armed triggers
        if not trigger["auto_disarm"] and trigger["last_triggered_at"]:
            last = datetime.fromisoformat(trigger["last_triggered_at"])
            elapsed_hours = (now - last).total_seconds() / 3600
            if elapsed_hours < trigger["cooldown_hours"]:
                print(f"Trigger {trigger['id']} in cooldown — skipping.")
                continue

        print(
            f"TRIGGER HIT: {trigger['ticker']} @ ${price:.2f} "
            f"(target: ${trigger['target_price']} {trigger['condition']})"
        )

        summary = await run_insight_agent(trigger, price)

        write_audit_log(trigger["id"], "insight_generated", {
            "ticker": trigger["ticker"],
            "price": price,
            "user_id": trigger["user_id"],
        })

        await send_email(trigger["user_id"], trigger["ticker"], summary)
        update_trigger_post_fire(None, trigger, now)

    print("Trigger check complete.")


if __name__ == "__main__":
    asyncio.run(main())
