import json

import httpx

from app.config import settings
from app.skills.news import get_market_news
from app.skills.notes import get_user_notes

_INSIGHT_PROMPT = """\
You are a financial analyst assistant for a personal trading journal.

A price alert has just triggered. Based on the trader's notes and current news,
write a concise 2-3 sentence insight that:
1. Confirms what happened (which level was hit, direction)
2. References the trader's own thesis from their notes
3. Highlights any relevant news that supports or challenges the thesis

Be direct. No disclaimers. End with one clear action the trader should consider.

Context:
Ticker: {ticker}
Alert: price {direction} ${trigger_price:.2f}
Trader notes: {notes}
Recent news: {news}
"""


async def _call_gemini(prompt: str) -> str:
    if not settings.gemini_api_key:
        return ""
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.5, "maxOutputTokens": 512},
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(url, json=body, headers={"x-goog-api-key": settings.gemini_api_key})
    r.raise_for_status()
    return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()


async def run_insight_agent(
    ticker: str,
    user_id: str,
    trigger_price: float,
    condition: str,
) -> str:
    notes = await get_user_notes(ticker, user_id)
    news = await get_market_news(ticker)
    direction = "risen above" if condition == "above" else "fallen below"

    if settings.gemini_api_key:
        prompt = _INSIGHT_PROMPT.format(
            ticker=ticker,
            direction=direction,
            trigger_price=trigger_price,
            notes=" | ".join(notes[:3]) or "No notes recorded.",
            news=" | ".join(news[:3]) or "No recent news.",
        )
        try:
            return await _call_gemini(prompt)
        except Exception:
            pass

    # Fallback: template-based insight
    notes_excerpt = notes[0][:100] if notes else "no prior notes"
    news_excerpt = news[0][:100] if news else "no recent news"
    return (
        f"{ticker} has {direction} your target of ${trigger_price:.2f}. "
        f"Your thesis: {notes_excerpt}. "
        f"Latest news: {news_excerpt}. "
        f"Review the position and decide whether to act or hold."
    )
