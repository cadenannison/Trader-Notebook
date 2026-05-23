"""
Insights API tests.

Runs against the in-memory mock (no Supabase configured).
Verifies API contract: shapes, status codes, empty-data behaviour.
"""


def test_insights_returns_200(client):
    resp = client.get("/api/insights")
    assert resp.status_code == 200


def test_insights_response_shape(client):
    data = client.get("/api/insights").json()
    assert "summary" in data
    assert "by_confidence_tag" in data
    assert "by_exit_reason" in data
    assert "by_time_horizon" in data
    assert "coaching_insights" in data


def test_insights_summary_shape(client):
    summary = client.get("/api/insights").json()["summary"]
    assert "total_trades" in summary
    assert "open_trades" in summary
    assert "win_rate" in summary
    assert "avg_return" in summary


def test_insights_empty_state_has_coaching_hint(client):
    data = client.get("/api/insights").json()
    assert isinstance(data["coaching_insights"], list)
    assert len(data["coaching_insights"]) > 0


def test_insights_empty_state_zero_trades(client):
    summary = client.get("/api/insights").json()["summary"]
    assert summary["total_trades"] == 0
    assert summary["open_trades"] == 0
    assert summary["win_rate"] == 0


def test_insights_empty_state_lists_are_empty(client):
    data = client.get("/api/insights").json()
    assert data["by_confidence_tag"] == []
    assert data["by_exit_reason"] == []
    assert data["by_time_horizon"] == []
