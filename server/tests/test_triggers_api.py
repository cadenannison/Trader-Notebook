"""
Triggers API tests.

Runs against the in-memory mock (no Supabase configured).
Verifies API contract: shapes, status codes, validation, CRUD.
"""


def test_get_triggers_returns_list(client):
    resp = client.get("/api/triggers")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_get_triggers_ticker_filter(client):
    resp = client.get("/api/triggers?ticker=NVDA")
    assert resp.status_code == 200
    data = resp.json()
    assert all(t["ticker"] == "NVDA" for t in data)


# ── Create ────────────────────────────────────────────────────────────────────


def test_create_trigger_above_returns_201(client):
    resp = client.post(
        "/api/triggers",
        json={
            "ticker": "NVDA",
            "target_price": 1000.0,
            "condition": "above",
        },
    )
    assert resp.status_code == 201


def test_create_trigger_below_returns_201(client):
    resp = client.post(
        "/api/triggers",
        json={
            "ticker": "AAPL",
            "target_price": 150.0,
            "condition": "below",
        },
    )
    assert resp.status_code == 201


def test_create_trigger_response_shape(client):
    resp = client.post(
        "/api/triggers",
        json={
            "ticker": "MSFT",
            "target_price": 400.0,
            "condition": "above",
        },
    )
    data = resp.json()
    assert "id" in data
    assert data["ticker"] == "MSFT"
    assert data["target_price"] == 400.0
    assert data["condition"] == "above"
    assert data["is_active"] is True
    assert data["auto_disarm"] is True
    assert data["cooldown_hours"] == 4


def test_create_trigger_ticker_is_uppercased(client):
    resp = client.post(
        "/api/triggers",
        json={
            "ticker": "tsla",
            "target_price": 200.0,
            "condition": "above",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["ticker"] == "TSLA"


def test_create_trigger_invalid_condition_returns_400(client):
    resp = client.post(
        "/api/triggers",
        json={
            "ticker": "NVDA",
            "target_price": 900.0,
            "condition": "sideways",
        },
    )
    assert resp.status_code == 400


def test_create_trigger_missing_ticker_returns_422(client):
    resp = client.post("/api/triggers", json={"target_price": 900.0, "condition": "above"})
    assert resp.status_code == 422


def test_create_trigger_missing_price_returns_422(client):
    resp = client.post("/api/triggers", json={"ticker": "NVDA", "condition": "above"})
    assert resp.status_code == 422


def test_create_trigger_advanced_settings(client):
    resp = client.post(
        "/api/triggers",
        json={
            "ticker": "NVDA",
            "target_price": 900.0,
            "condition": "above",
            "auto_disarm": False,
            "cooldown_hours": 8,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["auto_disarm"] is False
    assert data["cooldown_hours"] == 8


# ── Rearm ─────────────────────────────────────────────────────────────────────


def test_rearm_nonexistent_trigger_returns_404(client):
    resp = client.put("/api/triggers/does-not-exist/rearm")
    assert resp.status_code == 404


# ── Delete ────────────────────────────────────────────────────────────────────


def test_delete_nonexistent_trigger_returns_404(client):
    resp = client.delete("/api/triggers/does-not-exist")
    assert resp.status_code == 404


def test_create_then_delete(client):
    create = client.post(
        "/api/triggers",
        json={
            "ticker": "GOOGL",
            "target_price": 180.0,
            "condition": "below",
        },
    )
    assert create.status_code == 201
    trigger_id = create.json()["id"]

    delete = client.delete(f"/api/triggers/{trigger_id}")
    assert delete.status_code == 204
