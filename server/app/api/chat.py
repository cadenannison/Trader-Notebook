import json
import re
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.middleware.auth import get_current_user
from app.api.stock import _polygon_price, _MOCK_PRICES

_STOP_WORDS = {
    "A", "AN", "THE", "SET", "AT", "TO", "ON", "IF", "OR", "AND", "FOR",
    "UP", "IS", "IN", "MY", "ME", "IT", "BE", "DO", "GO", "SO", "BY",
    "NO", "US", "OK", "AI", "AM", "PM", "ETF", "CEO", "IPO",
}

router = APIRouter()

_SYSTEM_PROMPT = """You are tradrNotebook, an AI assistant for a personal stock trading journal.

Your job: help traders log ideas, set alerts, log trades, and review performance — all through natural language.

Rules:
1. Return ONLY valid JSON — no markdown fences, no text outside the JSON object.
2. Always include an action when the user's intent is clear. Never ask for confirmation before returning the action.
3. Keep messages concise and direct. You are a trading tool, not a therapist.
4. For log_idea: extract ticker, reasoning, idea_source, time_horizon, and any price levels mentioned.
5. For log_trade: extract ticker, entry_price, confidence_tag, and any other mentioned fields.
6. For close_trade: extract exit_price and map the reason to the closest exit_reason value.

Response format:
{"message": "Your response", "action": null}

Or with an action:
{"message": "Your response", "action": {"type": "<action_type>", ...fields}}

Action types and their fields:

add_alert — price alert on a ticker
  ticker, condition ("above"|"below"), price, note

show_view — navigate to a page
  view ("alerts"|"notebook"|"news"|"stats"|"watchlist")

log_idea — add a stock idea to the watchlist
  ticker, reasoning,
  idea_source: "own_research"|"tip"|"news"|"chart_pattern"|"earnings_catalyst"|"gut",
  time_horizon: "intraday"|"swing"|"position",
  entry_price (optional), target_price (optional), stop_price (optional)

log_trade — log a trade execution
  ticker, entry_price,
  confidence_tag: "confident"|"neutral"|"uncertain"|"fomo",
  time_horizon: "intraday"|"swing"|"position",
  cost_basis (optional), shares (optional)

close_trade — log a trade exit
  ticker, exit_price,
  exit_reason: "hit_target"|"hit_stop_loss"|"manually_stopped_out"|"thesis_changed"|"panic_sold"|"needed_capital"

Examples:

User: "I like NVDA for an AI earnings breakout, heard about it from my research, targeting $1100 with a stop at $870"
→ {"message": "Added NVDA to your watchlist. Target $1100, stop $870 — I'll watch for your entry signal.", "action": {"type": "log_idea", "ticker": "NVDA", "reasoning": "AI earnings breakout thesis", "idea_source": "own_research", "time_horizon": "swing", "target_price": 1100.0, "stop_price": 870.0}}

User: "alert me when NVDA hits 900"
→ {"message": "Watching NVDA above $900. What's the thesis?", "action": {"type": "add_alert", "ticker": "NVDA", "condition": "above", "price": 900.0, "note": "pending"}}

User: "I bought 50 shares of AAPL at $192, feeling confident"
→ {"message": "Trade logged — 50 shares of AAPL at $192. Confident tag attached.", "action": {"type": "log_trade", "ticker": "AAPL", "entry_price": 192.0, "shares": 50, "confidence_tag": "confident", "time_horizon": "swing"}}

User: "sold my NVDA position at $950, hit my target"
→ {"message": "Exit logged — NVDA at $950. Clean exit on plan.", "action": {"type": "close_trade", "ticker": "NVDA", "exit_price": 950.0, "exit_reason": "hit_target"}}

User: "I panic sold TSLA at $180"
→ {"message": "Exit logged. Panic sell noted — we'll track this pattern.", "action": {"type": "close_trade", "ticker": "TSLA", "exit_price": 180.0, "exit_reason": "panic_sold"}}

User: "show me my watchlist"
→ {"message": "Pulling up your watchlist.", "action": {"type": "show_view", "view": "watchlist"}}

Current context:
{context}
"""


class ChatMessage(BaseModel):
    role: str  # "user" | "model"
    text: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    context: Optional[str] = None


class ChatAction(BaseModel):
    type: str
    # add_alert
    ticker: Optional[str] = None
    condition: Optional[str] = None
    price: Optional[float] = None
    note: Optional[str] = None
    # show_view
    view: Optional[str] = None
    # log_idea
    reasoning: Optional[str] = None
    idea_source: Optional[str] = None
    time_horizon: Optional[str] = None
    entry_price: Optional[float] = None
    target_price: Optional[float] = None
    stop_price: Optional[float] = None
    # log_trade
    confidence_tag: Optional[str] = None
    cost_basis: Optional[float] = None
    shares: Optional[float] = None
    watchlist_entry_id: Optional[str] = None
    # close_trade
    trade_id: Optional[str] = None
    exit_price: Optional[float] = None
    exit_reason: Optional[str] = None


class ChatResponse(BaseModel):
    message: str
    action: Optional[ChatAction] = None


_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"]

async def _fetch_prices_for_message(message: str) -> str:
    candidates = set(re.findall(r"\b[A-Za-z]{1,5}\b", message))
    tickers = [t.upper() for t in candidates if t.upper() not in _STOP_WORDS and len(t) >= 2][:4]
    if not tickers:
        return "No price context available."
    lines = []
    for ticker in tickers:
        data = await _polygon_price(ticker)
        price = data["price"] if data else _MOCK_PRICES.get(ticker, {}).get("price")
        if price:
            lines.append(f"{ticker}: ${price:.2f}")
    return ("Current market prices — " + ", ".join(lines)) if lines else "No price data available."


async def _call_gemini(system: str, history: list[dict], user_message: str) -> str:
    contents = history + [{"role": "user", "parts": [{"text": user_message}]}]
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": contents,
        "generationConfig": {
            "temperature": 0.65,
            "maxOutputTokens": 1024,
            "responseMimeType": "application/json",
        },
    }
    import asyncio
    async with httpx.AsyncClient(timeout=25.0) as client:
        for model in _MODELS:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            for attempt in range(3):
                r = await client.post(url, json=body, headers={"x-goog-api-key": settings.gemini_api_key})
                if r.status_code == 429:
                    await asyncio.sleep(2 ** attempt)
                    continue
                r.raise_for_status()
                return r.json()["candidates"][0]["content"]["parts"][0]["text"]
    raise httpx.HTTPStatusError("All models rate-limited", request=r.request, response=r)


def _fallback_response(message: str) -> ChatResponse:
    """Simple pattern-matching when Gemini is not configured."""
    lower = message.lower()
    if any(w in lower for w in ("alert", "notify", "watch", "above", "below", "hits", "drops")):
        return ChatResponse(
            message="I can set that alert — but first, add your Gemini API key in Settings to enable natural-language parsing.",
        )
    if any(w in lower for w in ("show", "list", "my alerts", "notebook")):
        return ChatResponse(
            message="Head to the Alerts or Notebook tab in the sidebar.",
            action=ChatAction(type="show_view", view="alerts"),
        )
    return ChatResponse(
        message="Add your Gemini API key in Settings to enable the full AI assistant.",
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest, user_id: str = Depends(get_current_user)):
    if not settings.gemini_api_key:
        return _fallback_response(body.message)

    history = [
        {"role": msg.role, "parts": [{"text": msg.text}]}
        for msg in body.history[-10:]
    ]
    price_context = await _fetch_prices_for_message(body.message)
    system = _SYSTEM_PROMPT.replace("{context}", price_context)

    try:
        raw = await _call_gemini(system, history, body.message)
        data = json.loads(raw)
        action = ChatAction(**data["action"]) if data.get("action") else None
        return ChatResponse(message=data["message"], action=action)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            return ChatResponse(message="I'm being rate-limited by the AI provider — wait a moment and try again.")
        raise HTTPException(status_code=502, detail=f"AI error: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI error: {exc}")
