"""
Chat tool + action tests.

Tool-level tests call `_execute_tool` directly (no HTTP layer, no mocked
external APIs) and assert the graceful not-configured shape — same
convention as test_insights_api.py. The end-to-end test monkeypatches
Gemini's function-calling round trip to verify new action types survive
the `_VALID_ACTION_TYPES` filter through the real /api/chat endpoint.
"""

from unittest.mock import patch

import pytest

from app.api import chat as chat_module


# ── New read tools (_execute_tool) ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_insights_tool_not_configured():
    # Supabase creds are cleared by the autouse conftest fixture, so this
    # exercises get_insights' own graceful empty-state branch.
    result, tool_used = await chat_module._execute_tool("get_insights", {}, "user-1")
    assert "summary" in result
    assert result["summary"]["total_trades"] == 0
    assert tool_used.name == "get_insights"


@pytest.mark.asyncio
async def test_get_briefing_tool_not_configured():
    # briefing.get_briefing raises HTTPException(503) when Supabase isn't
    # configured — _execute_tool must catch it, not let it propagate.
    result, tool_used = await chat_module._execute_tool("get_briefing", {}, "user-1")
    assert "note" in result
    assert tool_used.name == "get_briefing"


@pytest.mark.asyncio
async def test_get_analyst_ratings_tool_not_configured():
    with patch.object(chat_module.settings, "finnhub_api_key", ""):
        result, tool_used = await chat_module._execute_tool(
            "get_analyst_ratings", {"ticker": "NVDA"}, "user-1"
        )
    assert result["ticker"] == "NVDA"
    assert result["ratings"] == []
    assert "note" in result
    assert tool_used.name == "get_analyst_ratings"
    assert tool_used.ticker == "NVDA"


# ── New action types survive the _VALID_ACTION_TYPES filter end-to-end ───────

_NEW_ACTION_TYPES = [
    "update_trade",
    "delete_trade",
    "update_watchlist_entry",
    "delete_watchlist_entry",
    "update_journal_note",
    "delete_journal_note",
    "update_portfolio",
    "delete_portfolio",
    "rearm_alert",
]


@pytest.mark.parametrize("action_type", _NEW_ACTION_TYPES)
def test_new_action_type_survives_chat_endpoint(client, monkeypatch, action_type):
    async def fake_call(system, history, user_message, user_id):
        return (
            '{"message": "done", "actions": [{"type": "%s", "ticker": "NVDA"}]}' % action_type,
            [],
        )

    monkeypatch.setattr(chat_module, "_call_gemini_with_tools", fake_call)
    monkeypatch.setattr(chat_module.settings, "gemini_api_key", "test-key")

    resp = client.post("/api/chat", json={"message": "do something", "history": []})
    assert resp.status_code == 200
    data = resp.json()
    assert data["actions"][0]["type"] == action_type


def test_unknown_action_type_is_dropped(client, monkeypatch):
    async def fake_call(system, history, user_message, user_id):
        return (
            '{"message": "done", "actions": [{"type": "not_a_real_action", "ticker": "NVDA"}]}',
            [],
        )

    monkeypatch.setattr(chat_module, "_call_gemini_with_tools", fake_call)
    monkeypatch.setattr(chat_module.settings, "gemini_api_key", "test-key")

    resp = client.post("/api/chat", json={"message": "do something", "history": []})
    assert resp.status_code == 200
    assert resp.json()["actions"] == []


# ── Repeated identical tool calls within one turn are deduplicated ───────────
#
# Regression test: a model that calls the same tool with the same args
# repeatedly (observed live: get_stock_price("SPMO") called 6 times in one
# turn) used to re-execute every time, burning the whole tool-round budget
# and — since Polygon's free tier rate-limits rapid repeat calls — getting
# worse data on every repeat. The loop must now execute a given (tool, args)
# pair at most once per turn and reuse the cached result for repeats.


@pytest.mark.asyncio
async def test_call_gemini_with_tools_dedupes_repeated_tool_calls(monkeypatch):
    call_count = 0

    async def fake_execute_tool(name, args, user_id):
        nonlocal call_count
        call_count += 1
        return {"ticker": args.get("ticker"), "price": 145.35}, chat_module.ToolUsed(
            name=name, ticker=args.get("ticker"), summary="$145.35"
        )

    async def fake_call_gemini_raw(body):
        # Every round, the model asks for the same tool + same args.
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"functionCall": {"name": "get_stock_price", "args": {"ticker": "SPMO"}}}
                        ]
                    }
                }
            ]
        }

    monkeypatch.setattr(chat_module, "_execute_tool", fake_execute_tool)
    monkeypatch.setattr(chat_module, "_call_gemini_raw", fake_call_gemini_raw)

    raw, tools_used = await chat_module._call_gemini_with_tools("system", [], "What's SPMO at?", "user-1")

    # The model "called" the tool 6 times (once per round), but the
    # underlying tool implementation should only have run once.
    assert call_count == 1
    assert len(tools_used) == 6
    assert all(t.summary == "$145.35" for t in tools_used)
