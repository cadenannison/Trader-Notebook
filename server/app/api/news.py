from fastapi import APIRouter, Depends, HTTPException

from app.config import settings
from app.middleware.auth import get_current_user
from app.skills.news import fetch_news_for_ticker

router = APIRouter()


@router.get("/news")
async def get_news(tickers: str, user_id: str = Depends(get_current_user)):
    """Return recent news for a comma-separated list of tickers.

    Requires FINNHUB_API_KEY. Returns 503 when not configured so the
    frontend can show a setup state rather than an error.
    """
    if not settings.finnhub_api_key:
        raise HTTPException(
            status_code=503,
            detail="Finnhub API key not configured. Add FINNHUB_API_KEY to your .env file.",
        )

    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()][:10]
    articles: list[dict] = []
    for ticker in ticker_list:
        articles.extend(await fetch_news_for_ticker(ticker))

    articles.sort(key=lambda a: a.get("published_at", ""), reverse=True)
    return articles
