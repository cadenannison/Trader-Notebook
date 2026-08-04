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
