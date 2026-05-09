import json
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.middleware.auth import get_current_user

router = APIRouter()

_SYSTEM_PROMPT = """You are tradrNotebook, an AI assistant for a personal stock trading journal.

Your job: help traders set price alerts and document their thesis (the "why" behind every trade).

Rules:
1. ALWAYS ask for the thesis when creating an alert — include the question in the same message.
2. Parse natural language: "Apple below 180", "NVDA up 5%", "alert me if Tesla drops $20".
3. Return ONLY valid JSON — no markdown fences, no text outside the JSON object.
4. Keep messages concise and direct. You are a trading tool, not a therapist.

Response format (always return this exact structure):
{
  "message": "Your response to the trader",
  "action": null
}

Or with an action:
{
  "message": "Your response",
  "action": {
    "type": "add_alert",
    "ticker": "NVDA",
    "condition": "above",
    "price": 900.0,
    "note": "thesis text or 'pending'"
  }
}

Action types:
- add_alert: create a price alert
- show_view: navigate ("view" is one of: alerts, notebook, news, stats)

Examples:
User: "alert me when NVDA hits 900"
→ {"message": "On it — watching NVDA above $900. What's the thesis behind this level?", "action": {"type": "add_alert", "ticker": "NVDA", "condition": "above", "price": 900.0, "note": "pending"}}

User: "watch AAPL below 180 — I think it loses support there"
→ {"message": "Alert set: AAPL below $180. Thesis attached.", "action": {"type": "add_alert", "ticker": "AAPL", "condition": "below", "price": 180.0, "note": "I think it loses support there"}}

User: "show me my alerts"
→ {"message": "Pulling up your alerts.", "action": {"type": "show_view", "view": "alerts"}}

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
    ticker: Optional[str] = None
    condition: Optional[str] = None
    price: Optional[float] = None
    note: Optional[str] = None
    view: Optional[str] = None


class ChatResponse(BaseModel):
    message: str
    action: Optional[ChatAction] = None


async def _call_gemini(system: str, history: list[dict], user_message: str) -> str:
    model = "gemini-2.0-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
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
    async with httpx.AsyncClient(timeout=25.0) as client:
        r = await client.post(url, json=body, headers={"x-goog-api-key": settings.gemini_api_key})
    r.raise_for_status()
    return r.json()["candidates"][0]["content"]["parts"][0]["text"]


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
        for msg in body.history[-10:]  # keep last 10 turns for context window
    ]
    system = _SYSTEM_PROMPT.replace("{context}", body.context or "No additional context.")

    try:
        raw = await _call_gemini(system, history, body.message)
        data = json.loads(raw)
        action = ChatAction(**data["action"]) if data.get("action") else None
        return ChatResponse(message=data["message"], action=action)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI error: {exc}")
