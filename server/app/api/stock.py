import re

from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

_MOCK_PRICES: dict = {
    "NVDA": {"ticker": "NVDA", "price": 875.40, "timestamp": "2026-04-30T14:32:00Z", "change_pct": 2.14},
    "AAPL": {"ticker": "AAPL", "price": 182.63, "timestamp": "2026-04-30T14:32:00Z", "change_pct": -0.41},
    "VGT":  {"ticker": "VGT",  "price": 428.15, "timestamp": "2026-04-30T14:32:00Z", "change_pct": 0.87},
    "MSFT": {"ticker": "MSFT", "price": 415.20, "timestamp": "2026-04-30T14:32:00Z", "change_pct": 1.23},
    "GOOGL":{"ticker": "GOOGL","price": 172.80, "timestamp": "2026-04-30T14:32:00Z", "change_pct": -0.62},
    "TSLA": {"ticker": "TSLA", "price": 185.10, "timestamp": "2026-04-30T14:32:00Z", "change_pct": -1.84},
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


@router.get("/stock/price")
@limiter.limit("30/minute")
async def get_stock_price(ticker: str, request: Request):
    """Return current price for a ticker. TODO: replace with Polygon.io call."""
    ticker = ticker.upper().strip()
    return _MOCK_PRICES.get(ticker, {
        "ticker": ticker,
        "price": 100.00,
        "timestamp": "2026-04-30T14:32:00Z",
        "change_pct": 0.0,
    })


@router.get("/stock/validate")
@limiter.limit("20/minute")
async def validate_ticker(ticker: str, request: Request):
    """Validate that a ticker symbol exists. TODO: replace with Polygon.io ticker details."""
    ticker = ticker.upper().strip()
    if not re.match(r"^[A-Z]{1,10}$", ticker):
        raise HTTPException(status_code=400, detail="Invalid ticker format")
    name = _MOCK_NAMES.get(ticker, f"{ticker} (unverified)")
    return {"ticker": ticker, "name": name, "valid": True}
