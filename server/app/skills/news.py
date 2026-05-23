from datetime import datetime, timedelta

import httpx

from app.config import settings

_BULLISH_WORDS = {
    "surge",
    "soar",
    "rally",
    "gain",
    "beat",
    "record",
    "strong",
    "growth",
    "upgrade",
    "buy",
    "positive",
    "outperform",
    "exceed",
    "momentum",
}
_BEARISH_WORDS = {
    "drop",
    "fall",
    "decline",
    "loss",
    "miss",
    "weak",
    "concern",
    "risk",
    "cut",
    "warn",
    "downgrade",
    "sell",
    "negative",
    "underperform",
    "disappoint",
}


def _sentiment(text: str) -> str:
    words = set(text.lower().split())
    bulls = len(words & _BULLISH_WORDS)
    bears = len(words & _BEARISH_WORDS)
    if bulls > bears:
        return "bullish"
    if bears > bulls:
        return "bearish"
    return "neutral"


async def fetch_news_for_ticker(ticker: str) -> list[dict]:
    """Fetch company news from Finnhub for the past 7 days."""
    if not settings.finnhub_api_key:
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
                    "token": settings.finnhub_api_key,
                },
            )
        if r.status_code != 200:
            return []
        articles = r.json()[:8]
        return [
            {
                "ticker": ticker,
                "headline": a.get("headline", ""),
                "source": a.get("source", ""),
                "sentiment": _sentiment(a.get("headline", "") + " " + a.get("summary", "")),
                "image_url": a.get("image") or None,
                "url": a.get("url", ""),
                "published_at": datetime.utcfromtimestamp(a["datetime"]).isoformat() + "Z"
                if a.get("datetime")
                else "",
            }
            for a in articles
            if a.get("headline")
        ]
    except Exception:
        return []


async def get_market_news(ticker: str) -> list[str]:
    """Return plain-text headlines for the insight agent."""
    articles = await fetch_news_for_ticker(ticker)
    if articles:
        return [a["headline"] for a in articles]
    return [
        f"{ticker} continues to track broader market sentiment.",
        f"No major catalyst headlines for {ticker} in the past 7 days.",
    ]
