"""
Notes API tests.

Runs against the in-memory mock (no Supabase configured).
Verifies API contract: shapes, status codes, field behaviour.
"""


def test_get_notes_returns_list(client):
    resp = client.get("/api/notes")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_get_notes_ticker_filter_returns_list(client):
    resp = client.get("/api/notes?ticker=NVDA")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert all(n["ticker"] == "NVDA" for n in data)


def test_create_note_returns_201(client):
    resp = client.post("/api/notes", json={"ticker": "AAPL", "content": "Strong services revenue."})
    assert resp.status_code == 201


def test_create_note_response_shape(client):
    resp = client.post("/api/notes", json={"ticker": "AAPL", "content": "Services revenue is growing."})
    data = resp.json()
    assert "id" in data
    assert "ticker" in data
    assert "content" in data
    assert "created_at" in data


def test_create_note_ticker_is_uppercased(client):
    resp = client.post("/api/notes", json={"ticker": "aapl", "content": "lowercase ticker"})
    assert resp.status_code == 201
    assert resp.json()["ticker"] == "AAPL"


def test_create_note_content_is_preserved(client):
    content = "Watching for breakout above $180 resistance."
    resp = client.post("/api/notes", json={"ticker": "AAPL", "content": content})
    assert resp.status_code == 201
    assert resp.json()["content"] == content


def test_create_note_missing_ticker_returns_422(client):
    resp = client.post("/api/notes", json={"content": "no ticker"})
    assert resp.status_code == 422


def test_create_note_missing_content_returns_422(client):
    resp = client.post("/api/notes", json={"ticker": "AAPL"})
    assert resp.status_code == 422


def test_create_note_empty_body_returns_422(client):
    resp = client.post("/api/notes", json={})
    assert resp.status_code == 422
