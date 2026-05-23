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
    "A",
    "AN",
    "THE",
    "SET",
    "AT",
    "TO",
    "ON",
    "IF",
    "OR",
    "AND",
    "FOR",
    "UP",
    "IS",
    "IN",
    "MY",
    "ME",
    "IT",
    "BE",
    "DO",
    "GO",
    "SO",
    "BY",
    "NO",
    "US",
    "OK",
    "AI",
    "AM",
    "PM",
    "ETF",
    "CEO",
    "IPO",
}

router = APIRouter()

_SYSTEM_PROMPT = """You are tradrNotebook, an AI assistant for a personal stock trading journal.

Your job: help traders log ideas, set alerts, log trades, create portfolios, write notes, and review performance — all through natural language. You have full access to the user's portfolios, active alerts, watchlist, open positions, and journal notes — use them to answer questions accurately.

Rules:
1. Return ONLY valid JSON — no markdown fences, no text outside the JSON object.
2. Always include an action when the user's intent is clear. Never ask for confirmation before returning the action.
3. Keep messages concise and direct. You are a trading tool, not a therapist.
4. For log_idea: extract ticker, reasoning, idea_source, time_horizon, and any price levels mentioned.
5. For log_trade: extract ticker, entry_price, confidence_tag, and any other mentioned fields.
6. For close_trade: extract exit_price and map the reason to the closest exit_reason value.
7. For create_portfolio: extract the name, thesis from ANY reasoning the user mentions, and list of tickers.
8. For assign_to_portfolio: use portfolio_name (not ID) and the list of tickers to move.
9. For add_journal_note: extract a title (optional), the note content, and any ticker tags mentioned.
10. When answering questions about the user's data — summarize from the context below. Be specific: name tickers, prices, portfolio names.
11. For add_alert: ALWAYS extract any reasoning, thesis, or "I think..." statements into the `note` field. Never discard this text.
12. For add_alert with a portfolio — include portfolio_name so the alert is grouped on creation.
13. If a request is ambiguous and a critical field is missing (e.g. price for an alert, ticker for a trade), ask ONE short clarifying question and return an empty actions array. Do not guess.
14. For update_alert: look up the user's active alerts in context to find the matching one. Use old_price to disambiguate when a ticker has multiple alerts.

Response format — always use an "actions" array (can be empty):
{"message": "Your response", "actions": []}

With one or more actions:
{"message": "Your response", "actions": [{"type": "<action_type>", ...fields}, ...]}

Action types and their fields:

add_alert — price alert on a ticker
  ticker, condition ("above"|"below"), price, note (optional), portfolio_name (optional — name of portfolio to assign to)

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

create_portfolio — group alerts into a named portfolio with a strategy thesis
  name, thesis (optional), tickers (array of ticker symbols to assign existing alerts for, optional)

assign_to_portfolio — move existing alerts for specified tickers into a portfolio
  portfolio_name (name of the portfolio, case-insensitive match), tickers (array of ticker symbols)

add_journal_note — create a new journal note
  content (the note body), title (optional), tags (optional array of ticker symbols or keywords)

update_alert — edit an existing price alert
  ticker, new_price (optional), new_condition ("above"|"below", optional), new_note (optional)
  old_price (optional — helps identify which alert when ticker has multiple)

delete_alert — delete one or all alerts for a ticker
  ticker
  price (optional — if provided, delete only the alert at that price; if omitted, delete ALL alerts for that ticker)
  condition (optional — additional disambiguator)

Examples:

User: "I like NVDA for an AI earnings breakout, heard about it from my research, targeting $1100 with a stop at $870"
→ {"message": "Added NVDA to your watchlist. Target $1100, stop $870 — I'll watch for your entry signal.", "actions": [{"type": "log_idea", "ticker": "NVDA", "reasoning": "AI earnings breakout thesis", "idea_source": "own_research", "time_horizon": "swing", "target_price": 1100.0, "stop_price": 870.0}]}

User: "alert me when NVDA hits 900, put it in my AI Infrastructure portfolio"
→ {"message": "Alert set — NVDA above $900, added to AI Infrastructure.", "actions": [{"type": "add_alert", "ticker": "NVDA", "condition": "above", "price": 900.0, "portfolio_name": "AI Infrastructure"}]}

User: "I bought 50 shares of AAPL at $192, feeling confident"
→ {"message": "Trade logged — 50 shares of AAPL at $192. Confident tag attached.", "actions": [{"type": "log_trade", "ticker": "AAPL", "entry_price": 192.0, "shares": 50, "confidence_tag": "confident", "time_horizon": "swing"}]}

User: "sold my NVDA position at $950, hit my target"
→ {"message": "Exit logged — NVDA at $950. Clean exit on plan.", "actions": [{"type": "close_trade", "ticker": "NVDA", "exit_price": 950.0, "exit_reason": "hit_target"}]}

User: "create alert for NVDA above 1050. I think when they release earnings the stock will spike. Add to new portfolio 'AI related companies'"
→ {"message": "Done — NVDA alert above $1050 set and added to new portfolio 'AI related companies'.", "actions": [{"type": "create_portfolio", "name": "AI related companies", "thesis": "Earnings catalyst — stock will spike on earnings release"}, {"type": "add_alert", "ticker": "NVDA", "condition": "above", "price": 1050.0, "note": "Earnings catalyst — stock will spike on earnings release", "portfolio_name": "AI related companies"}]}

User: "change my NVDA alert to 1100"
→ {"message": "NVDA alert updated to above $1100.", "actions": [{"type": "update_alert", "ticker": "NVDA", "new_price": 1100.0}]}

User: "change my NVDA above 1050 alert to 1150, and flip it to a below alert"
→ {"message": "NVDA alert updated: below $1150.", "actions": [{"type": "update_alert", "ticker": "NVDA", "old_price": 1050.0, "new_price": 1150.0, "new_condition": "below"}]}

User: "delete my NVDA 1050 alert"
→ {"message": "Deleted NVDA alert at $1050.", "actions": [{"type": "delete_alert", "ticker": "NVDA", "price": 1050.0}]}

User: "remove all my TSLA alerts"
→ {"message": "Removed all TSLA alerts.", "actions": [{"type": "delete_alert", "ticker": "TSLA"}]}

User: "set an alert for AAPL"
→ {"message": "What price level should I watch for AAPL — above or below what?", "actions": []}

User: "I like TSLA for a swing trade targeting $300, log the idea and add an alert"
→ {"message": "TSLA watchlist idea added and alert set above $300.", "actions": [{"type": "log_idea", "ticker": "TSLA", "reasoning": "swing trade targeting $300", "idea_source": "own_research", "time_horizon": "swing", "target_price": 300.0}, {"type": "add_alert", "ticker": "TSLA", "condition": "above", "price": 300.0}]}

User: "move my TSLA and RIVN alerts into my EV Plays portfolio"
→ {"message": "Moved TSLA and RIVN alerts into EV Plays.", "actions": [{"type": "assign_to_portfolio", "portfolio_name": "EV Plays", "tickers": ["TSLA", "RIVN"]}]}

User: "note: NVDA holding above $900 support, watching for volume confirmation before adding"
→ {"message": "Note saved.", "actions": [{"type": "add_journal_note", "title": "NVDA support watch", "content": "NVDA holding above $900 support, watching for volume confirmation before adding", "tags": ["NVDA"]}]}

User: "what's in my AI Infrastructure portfolio?"
→ (look at context below, then) {"message": "Your AI Infrastructure portfolio has NVDA above $900 and AMD above $180. Thesis: betting on compute buildout through 2026.", "actions": []}

User: "summarize my open positions"
→ (look at open positions in context, then) {"message": "You have 2 open positions: AAPL 50 shares @ $192 (confident) and TSLA @ $210 (neutral).", "actions": []}

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
    # create_portfolio / assign_to_portfolio
    name: Optional[str] = None
    thesis: Optional[str] = None
    tickers: Optional[list[str]] = None
    portfolio_name: Optional[str] = None
    # add_journal_note
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[list[str]] = None
    # update_alert
    new_price: Optional[float] = None
    new_condition: Optional[str] = None
    new_note: Optional[str] = None
    old_price: Optional[float] = None


class ChatResponse(BaseModel):
    message: str
    action: Optional[ChatAction] = None  # kept for backwards compat
    actions: list[ChatAction] = []


_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"]


async def _fetch_prices_for_message(message: str) -> str:
    candidates = set(re.findall(r"\b[A-Za-z]{1,5}\b", message))
    tickers = [t.upper() for t in candidates if t.upper() not in _STOP_WORDS and len(t) >= 2][:4]
    if not tickers:
        return ""
    lines = []
    for ticker in tickers:
        data = await _polygon_price(ticker)
        price = data["price"] if data else _MOCK_PRICES.get(ticker, {}).get("price")
        if price:
            lines.append(f"{ticker}: ${price:.2f}")
    return ("Current market prices — " + ", ".join(lines)) if lines else ""


async def _build_full_context(user_id: str, message: str) -> str:
    """Assemble portfolios, alerts, watchlist, positions, and notes for the AI prompt."""
    parts: list[str] = []

    price_ctx = await _fetch_prices_for_message(message)
    if price_ctx:
        parts.append(price_ctx)

    if not (settings.supabase_url and settings.supabase_service_key):
        # Dev mode — just notes from mock (usually empty)
        from app.api.journal_notes import get_notes_context

        notes_ctx = await get_notes_context(user_id)
        if notes_ctx:
            parts.append(notes_ctx)
        return "\n\n".join(parts) or "No additional context."

    try:
        from supabase import create_client
        from app.crypto.keys import decrypt, derive_key

        sb = create_client(settings.supabase_url, settings.supabase_service_key)
        key = derive_key(settings.master_key, user_id)

        # Portfolios
        portfolios = (
            sb.table("portfolios").select("id, name, thesis").eq("user_id", user_id).execute().data
        )
        portfolio_map = {p["id"]: p for p in portfolios}

        # Triggers
        triggers = (
            sb.table("triggers")
            .select("ticker, target_price, condition, is_active, portfolio_id, notes")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(40)
            .execute()
            .data
        )

        if portfolios:
            lines = []
            for p in portfolios:
                assigned = [t["ticker"] for t in triggers if t.get("portfolio_id") == p["id"]]
                tickers_str = ", ".join(assigned) if assigned else "none"
                thesis_str = f" | thesis: {p['thesis'][:120]}" if p.get("thesis") else ""
                lines.append(f"  • {p['name']}: [{tickers_str}]{thesis_str}")
            parts.append("Portfolios:\n" + "\n".join(lines))

        active = [t for t in triggers if t["is_active"]]
        if active:
            lines = []
            for t in active[:20]:
                note_str = f" — {t['notes'][:60]}" if t.get("notes") else ""
                port_name = portfolio_map.get(t.get("portfolio_id") or "", {}).get("name", "")
                folder_str = f" [{port_name}]" if port_name else ""
                lines.append(
                    f"  {t['ticker']} {t['condition']} ${t['target_price']}{folder_str}{note_str}"
                )
            parts.append("Active alerts:\n" + "\n".join(lines))

        # Watchlist
        watchlist = (
            sb.table("watchlist_entries")
            .select("ticker, reasoning, time_horizon, target_price, stop_price")
            .eq("user_id", user_id)
            .in_("status", ["watching", "active_trade"])
            .order("created_at", desc=True)
            .limit(10)
            .execute()
            .data
        )
        if watchlist:
            lines = []
            for e in watchlist:
                tp = f" target ${e['target_price']}" if e.get("target_price") else ""
                sp = f" stop ${e['stop_price']}" if e.get("stop_price") else ""
                lines.append(
                    f"  {e['ticker']} ({e['time_horizon']}){tp}{sp}: {e['reasoning'][:100]}"
                )
            parts.append("Watchlist ideas:\n" + "\n".join(lines))

        # Open trades
        trades = (
            sb.table("trades")
            .select("ticker, entry_price, shares, confidence_tag, time_horizon")
            .eq("user_id", user_id)
            .is_("exit_price", "null")
            .order("created_at", desc=True)
            .limit(10)
            .execute()
            .data
        )
        if trades:
            lines = []
            for t in trades:
                shares_str = f" x{t['shares']}" if t.get("shares") else ""
                lines.append(
                    f"  {t['ticker']} @ ${t['entry_price']}{shares_str} [{t['confidence_tag']}]"
                )
            parts.append("Open positions:\n" + "\n".join(lines))

        # Journal notes
        note_rows = (
            sb.table("journal_notes")
            .select("title, encrypted_content, tags, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(8)
            .execute()
            .data
        )
        if note_rows:
            lines = []
            for r in note_rows:
                content = decrypt(bytes.fromhex(r["encrypted_content"]), key)
                date = r["created_at"][:10]
                tags_str = ", ".join(r["tags"]) if r.get("tags") else "general"
                title = r.get("title") or "(untitled)"
                lines.append(f"  [{date}] {title} [{tags_str}]: {content[:180]}")
            parts.append("Recent journal notes:\n" + "\n".join(lines))

    except Exception:
        from app.api.journal_notes import get_notes_context

        notes_ctx = await get_notes_context(user_id)
        if notes_ctx:
            parts.append(notes_ctx)

    return "\n\n".join(parts) or "No additional context."


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
                r = await client.post(
                    url, json=body, headers={"x-goog-api-key": settings.gemini_api_key}
                )
                if r.status_code == 429:
                    await asyncio.sleep(2**attempt)
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

    history = [{"role": msg.role, "parts": [{"text": msg.text}]} for msg in body.history[-10:]]
    full_context = await _build_full_context(user_id, body.message)
    system = _SYSTEM_PROMPT.replace("{context}", full_context)

    try:
        raw = await _call_gemini(system, history, body.message)
        data = json.loads(raw)
        # Support both new "actions" array and legacy "action" single object
        actions = [ChatAction(**a) for a in data.get("actions", [])]
        if not actions and data.get("action"):
            actions = [ChatAction(**data["action"])]
        return ChatResponse(message=data["message"], actions=actions)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            return ChatResponse(
                message="I'm being rate-limited by the AI provider — wait a moment and try again."
            )
        raise HTTPException(status_code=502, detail=f"AI error: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI error: {exc}")
