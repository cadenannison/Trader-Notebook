"""
User API tests.

Runs against the in-memory mock (no Supabase configured).
Verifies API contract for export and account deletion.
"""


def test_export_returns_200(client):
    resp = client.get("/api/user/export")
    assert resp.status_code == 200


def test_export_response_shape(client):
    data = client.get("/api/user/export").json()
    assert "user_id" in data
    assert "exported_at" in data
    assert "notes" in data
    assert "triggers" in data
    assert "trades" in data
    assert "watchlist" in data
    assert "portfolios" in data
    assert "journal_notes" in data


def test_export_empty_state_returns_empty_lists(client):
    data = client.get("/api/user/export").json()
    assert data["notes"] == []
    assert data["triggers"] == []
    assert data["trades"] == []
    assert data["watchlist"] == []
    assert data["portfolios"] == []
    assert data["journal_notes"] == []


def test_delete_account_returns_204(client):
    resp = client.delete("/api/user/me")
    assert resp.status_code == 204
