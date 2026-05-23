"""
Watchlist API tests.

Runs against the in-memory mock (no Supabase configured).
Verifies API contract: shapes, status codes, validation, CRUD.
"""


def test_get_watchlist_returns_list(client):
    resp = client.get("/api/watchlist")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_create_entry_returns_201(client):
    resp = client.post(
        "/api/watchlist",
        json={
            "ticker": "NVDA",
            "reasoning": "AI capex cycle still intact.",
        },
    )
    assert resp.status_code == 201


def test_create_entry_response_shape(client):
    resp = client.post(
        "/api/watchlist",
        json={
            "ticker": "AAPL",
            "reasoning": "Services thesis.",
        },
    )
    data = resp.json()
    assert "id" in data
    assert data["ticker"] == "AAPL"
    assert data["reasoning"] == "Services thesis."
    assert data["status"] == "watching"
    assert "created_at" in data


def test_create_entry_ticker_is_uppercased(client):
    resp = client.post(
        "/api/watchlist",
        json={
            "ticker": "msft",
            "reasoning": "Cloud growth.",
        },
    )
    assert resp.json()["ticker"] == "MSFT"


def test_create_entry_invalid_idea_source_returns_400(client):
    resp = client.post(
        "/api/watchlist",
        json={
            "ticker": "TSLA",
            "reasoning": "EV play.",
            "idea_source": "made_up_source",
        },
    )
    assert resp.status_code == 400


def test_create_entry_invalid_time_horizon_returns_400(client):
    resp = client.post(
        "/api/watchlist",
        json={
            "ticker": "TSLA",
            "reasoning": "EV play.",
            "time_horizon": "yearly",
        },
    )
    assert resp.status_code == 400


def test_create_entry_missing_ticker_returns_422(client):
    resp = client.post("/api/watchlist", json={"reasoning": "No ticker."})
    assert resp.status_code == 422


def test_create_entry_missing_reasoning_returns_422(client):
    resp = client.post("/api/watchlist", json={"ticker": "AAPL"})
    assert resp.status_code == 422


def test_create_entry_with_prices(client):
    resp = client.post(
        "/api/watchlist",
        json={
            "ticker": "GOOGL",
            "reasoning": "Ads recovery.",
            "entry_price": 170.0,
            "target_price": 200.0,
            "stop_price": 160.0,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["entry_price"] == 170.0
    assert data["target_price"] == 200.0
    assert data["stop_price"] == 160.0


def test_update_nonexistent_entry_returns_404(client):
    resp = client.put("/api/watchlist/does-not-exist", json={"status": "completed"})
    assert resp.status_code == 404


def test_delete_nonexistent_entry_returns_404(client):
    resp = client.delete("/api/watchlist/does-not-exist")
    assert resp.status_code == 404


def test_create_then_delete(client):
    create = client.post(
        "/api/watchlist",
        json={
            "ticker": "AMD",
            "reasoning": "AI GPU competition.",
        },
    )
    assert create.status_code == 201
    entry_id = create.json()["id"]

    delete = client.delete(f"/api/watchlist/{entry_id}")
    assert delete.status_code == 204


def test_create_then_update_status(client):
    create = client.post(
        "/api/watchlist",
        json={
            "ticker": "META",
            "reasoning": "Ad targeting thesis.",
        },
    )
    entry_id = create.json()["id"]

    update = client.put(f"/api/watchlist/{entry_id}", json={"status": "active_trade"})
    assert update.status_code == 200
    assert update.json()["status"] == "active_trade"


def test_update_invalid_status_returns_400(client):
    create = client.post(
        "/api/watchlist",
        json={
            "ticker": "AMZN",
            "reasoning": "AWS margin expansion.",
        },
    )
    entry_id = create.json()["id"]
    resp = client.put(f"/api/watchlist/{entry_id}", json={"status": "underwater"})
    assert resp.status_code == 400


def test_filter_by_status(client):
    client.post("/api/watchlist", json={"ticker": "SPY", "reasoning": "Index exposure."})
    resp = client.get("/api/watchlist?status=watching")
    assert resp.status_code == 200
    assert all(e["status"] == "watching" for e in resp.json())
