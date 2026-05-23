import asyncio
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.middleware.auth import get_current_user

router = APIRouter()


class BriefingResponse(BaseModel):
    date: str
    near_triggers: list[dict]
    earnings_today: list[dict]
    overnight_movers: list[dict]
    coaching_insight: str | None
    tickers_watched: list[str]


def _get_sb():
    if not (settings.supabase_url and settings.supabase_service_key):
        return None
    from supabase import create_client

    return create_client(settings.supabase_url, settings.supabase_service_key)


async def _batch_prices(tickers: list[str]) -> dict[str, float]:
    if not tickers or not settings.polygon_api_key:
        return {}
    symbols = ",".join(tickers)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                "https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers",
                params={"tickers": symbols, "apiKey": settings.polygon_api_key},
            )
        if r.status_code != 200:
            return {}
        return {
            item["ticker"]: item["day"]["c"]
            for item in r.json().get("tickers", [])
            if item.get("day", {}).get("c")
        }
    except Exception:
        return {}


async def _earnings_today(tickers: list[str]) -> list[dict]:
    if not tickers or not settings.finnhub_api_key:
        return []
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                "https://finnhub.io/api/v1/calendar/earnings",
                params={"from": today, "to": today, "token": settings.finnhub_api_key},
            )
        if r.status_code != 200:
            return []
        watched = set(tickers)
        return [
            {"ticker": e["symbol"], "time": e.get("hour", "unknown")}
            for e in r.json().get("earningsCalendar", [])
            if e.get("symbol") in watched
        ]
    except Exception:
        return []


async def _coaching_insight(
    user_id: str,
    near_triggers: list[dict],
    earnings: list[dict],
    movers: list[dict],
) -> str | None:
    if not settings.gemini_api_key:
        return None

    # Fetch recent closed trades for behavioral context
    sb = _get_sb()
    recent_trades: list[dict] = []
    if sb:
        result = (
            sb.table("trades")
            .select("ticker,confidence_tag,exit_reason,return_pct,time_horizon")
            .eq("user_id", user_id)
            .eq("status", "closed")
            .order("closed_at", desc=True)
            .limit(10)
            .execute()
        )
        recent_trades = result.data or []

    near_str = (
        ", ".join(f"{n['ticker']} ({n['pct_away']:.1f}% away)" for n in near_triggers) or "none"
    )
    earn_str = ", ".join(e["ticker"] for e in earnings) or "none"
    movers_str = ", ".join(f"{m['ticker']} {m['change_pct']:+.1f}%" for m in movers) or "none"
    trades_str = (
        "\n".join(
            f"- {t['ticker']}: {t['confidence_tag']} entry, {t['exit_reason'] or 'open'}, {t['return_pct']:+.1f}% return"
            for t in recent_trades
            if t.get("return_pct") is not None
        )
        or "No recent closed trades."
    )

    prompt = f"""You are a trading coach. Generate ONE concise, specific coaching insight (2 sentences max) for this trader's morning briefing.

Today's context:
- Near-trigger setups: {near_str}
- Earnings today: {earn_str}
- Overnight movers: {movers_str}

Recent trade history:
{trades_str}

Focus on a behavioral pattern you notice, not generic advice. Be direct and specific."""

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent",
                json={
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.7, "maxOutputTokens": 150},
                },
                headers={"x-goog-api-key": settings.gemini_api_key},
            )
        if r.status_code == 200:
            return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception:
        pass
    return None


@router.get("/briefing", response_model=BriefingResponse)
async def get_briefing(user_id: str = Depends(get_current_user)):
    sb = _get_sb()
    if not sb:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    # 1. Get active watchlist entries
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
        return BriefingResponse(
            date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            near_triggers=[],
            earnings_today=[],
            overnight_movers=[],
            coaching_insight=None,
            tickers_watched=[],
        )

    # 2. Fetch prices, earnings in parallel
    prices, earnings = await asyncio.gather(
        _batch_prices(tickers),
        _earnings_today(tickers),
    )

    # 3. Near-trigger entries (within 3% of target or stop)
    near_triggers = []
    for e in entries:
        price = prices.get(e["ticker"])
        if not price:
            continue
        for level_key in ("target_price", "stop_price"):
            level = e.get(level_key)
            if level and level > 0:
                pct_away = abs(price - level) / level * 100
                if pct_away <= 3.0:
                    near_triggers.append(
                        {
                            "ticker": e["ticker"],
                            "level_type": level_key,
                            "level": level,
                            "current_price": price,
                            "pct_away": pct_away,
                        }
                    )

    # 4. Open trades that moved >2% from entry (overnight movers)
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

    # 5. Coaching insight from Gemini
    insight = await _coaching_insight(user_id, near_triggers, earnings, overnight_movers)

    return BriefingResponse(
        date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        near_triggers=near_triggers,
        earnings_today=earnings,
        overnight_movers=overnight_movers,
        coaching_insight=insight,
        tickers_watched=tickers,
    )
