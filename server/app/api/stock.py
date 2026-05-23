import re
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

_MOCK_PRICES: dict = {
    "NVDA": {
        "ticker": "NVDA",
        "price": 875.40,
        "timestamp": "2026-05-09T14:32:00Z",
        "change_pct": 2.14,
    },
    "AAPL": {
        "ticker": "AAPL",
        "price": 182.63,
        "timestamp": "2026-05-09T14:32:00Z",
        "change_pct": -0.41,
    },
    "VGT": {
        "ticker": "VGT",
        "price": 428.15,
        "timestamp": "2026-05-09T14:32:00Z",
        "change_pct": 0.87,
    },
    "MSFT": {
        "ticker": "MSFT",
        "price": 415.20,
        "timestamp": "2026-05-09T14:32:00Z",
        "change_pct": 1.23,
    },
    "GOOGL": {
        "ticker": "GOOGL",
        "price": 172.80,
        "timestamp": "2026-05-09T14:32:00Z",
        "change_pct": -0.62,
    },
    "TSLA": {
        "ticker": "TSLA",
        "price": 185.10,
        "timestamp": "2026-05-09T14:32:00Z",
        "change_pct": -1.84,
    },
    "META": {
        "ticker": "META",
        "price": 512.30,
        "timestamp": "2026-05-09T14:32:00Z",
        "change_pct": 0.54,
    },
    "AMZN": {
        "ticker": "AMZN",
        "price": 186.45,
        "timestamp": "2026-05-09T14:32:00Z",
        "change_pct": -0.27,
    },
}

_MOCK_NAMES: dict = {
    "NVDA": "NVIDIA Corporation",
    "AAPL": "Apple Inc.",
    "VGT": "Vanguard Information Technology ETF",
    "MSFT": "Microsoft Corporation",
    "GOOGL": "Alphabet Inc.",
    "AMZN": "Amazon.com Inc.",
    "TSLA": "Tesla Inc.",
    "META": "Meta Platforms Inc.",
    "SPY": "SPDR S&P 500 ETF Trust",
    "QQQ": "Invesco QQQ Trust",
}


async def _polygon_price(ticker: str) -> dict | None:
    """Fetch previous-day close from Polygon.io. Returns None if key absent or call fails."""
    if not settings.polygon_api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.get(
                f"https://api.polygon.io/v2/aggs/ticker/{ticker}/prev",
                params={"adjusted": "true", "apiKey": settings.polygon_api_key},
            )
        if r.status_code != 200:
            return None
        results = r.json().get("results")
        if not results:
            return None
        bar = results[0]
        prev = bar.get("o", bar["c"])
        change_pct = ((bar["c"] - prev) / prev * 100) if prev else 0.0
        ts = datetime.fromtimestamp(bar["t"] / 1000, tz=timezone.utc).isoformat()
        return {
            "ticker": ticker,
            "price": bar["c"],
            "timestamp": ts,
            "change_pct": round(change_pct, 2),
        }
    except Exception:
        return None


async def _polygon_validate(ticker: str) -> dict | None:
    if not settings.polygon_api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.get(
                f"https://api.polygon.io/v3/reference/tickers/{ticker}",
                params={"apiKey": settings.polygon_api_key},
            )
        if r.status_code != 200:
            return None
        data = r.json().get("results", {})
        return {"ticker": ticker, "name": data.get("name", ticker), "valid": True}
    except Exception:
        return None


@router.get("/stock/price")
@limiter.limit("60/minute")
async def get_stock_price(ticker: str, request: Request):
    ticker = ticker.upper().strip()
    live = await _polygon_price(ticker)
    if live:
        return live
    return _MOCK_PRICES.get(
        ticker,
        {
            "ticker": ticker,
            "price": 0.0,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "change_pct": 0.0,
        },
    )


@router.get("/stock/validate")
@limiter.limit("30/minute")
async def validate_ticker(ticker: str, request: Request):
    ticker = ticker.upper().strip()
    if not re.match(r"^[A-Z]{1,10}$", ticker):
        raise HTTPException(status_code=400, detail="Invalid ticker format")
    live = await _polygon_validate(ticker)
    if live:
        return live
    name = _MOCK_NAMES.get(ticker, ticker)
    return {"ticker": ticker, "name": name, "valid": True}
