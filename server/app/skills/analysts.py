import httpx

from app.config import settings


async def fetch_analyst_ratings(ticker: str) -> dict:
    """Fetch analyst recommendation trends (buy/hold/sell counts) from Finnhub."""
    if not settings.finnhub_api_key:
        return {"ticker": ticker, "ratings": [], "note": "Finnhub not configured"}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                "https://finnhub.io/api/v1/stock/recommendation",
                params={"symbol": ticker, "token": settings.finnhub_api_key},
            )
        if r.status_code != 200 or not r.json():
            return {"ticker": ticker, "ratings": [], "note": "No analyst data available"}
        data = r.json()[:3]  # most recent 3 monthly periods, Finnhub returns desc by period
        ratings = [
            {
                "period": d.get("period"),
                "strong_buy": d.get("strongBuy", 0),
                "buy": d.get("buy", 0),
                "hold": d.get("hold", 0),
                "sell": d.get("sell", 0),
                "strong_sell": d.get("strongSell", 0),
            }
            for d in data
        ]
        return {"ticker": ticker, "ratings": ratings}
    except Exception:
        return {"ticker": ticker, "ratings": [], "note": "Error fetching analyst data"}
