"""
Trades API tests.

Runs against the in-memory mock (no Supabase configured).
Verifies API contract: shapes, status codes, CRUD, close logic.
"""

import pytest


def test_get_trades_returns_list(client):
    resp = client.get("/api/trades")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_create_trade_returns_201(client):
    resp = client.post(
        "/api/trades",
        json={
            "ticker": "NVDA",
            "entry_price": 850.0,
        },
    )
    assert resp.status_code == 201


def test_create_trade_response_shape(client):
    resp = client.post(
        "/api/trades",
        json={
            "ticker": "AAPL",
            "entry_price": 180.0,
        },
    )
    data = resp.json()
    assert "id" in data
    assert data["ticker"] == "AAPL"
    assert data["entry_price"] == 180.0
    assert data["status"] == "open"
    assert data["exit_price"] is None
    assert data["return_pct"] is None
    assert "logged_at" in data


def test_create_trade_ticker_uppercased(client):
    resp = client.post("/api/trades", json={"ticker": "tsla", "entry_price": 200.0})
    assert resp.json()["ticker"] == "TSLA"


def test_create_trade_invalid_confidence_returns_400(client):
    resp = client.post(
        "/api/trades",
        json={
            "ticker": "NVDA",
            "entry_price": 850.0,
            "confidence_tag": "very_sure",
        },
    )
    assert resp.status_code == 400


def test_create_trade_invalid_horizon_returns_400(client):
    resp = client.post(
        "/api/trades",
        json={
            "ticker": "NVDA",
            "entry_price": 850.0,
            "time_horizon": "forever",
        },
    )
    assert resp.status_code == 400


def test_create_trade_missing_ticker_returns_422(client):
    resp = client.post("/api/trades", json={"entry_price": 100.0})
    assert resp.status_code == 422


def test_create_trade_missing_price_returns_422(client):
    resp = client.post("/api/trades", json={"ticker": "NVDA"})
    assert resp.status_code == 422


def test_close_trade_computes_return_pct(client):
    create = client.post("/api/trades", json={"ticker": "MSFT", "entry_price": 400.0})
    trade_id = create.json()["id"]

    close = client.put(
        f"/api/trades/{trade_id}/close",
        json={
            "exit_price": 440.0,
            "exit_reason": "hit_target",
        },
    )
    assert close.status_code == 200
    data = close.json()
    assert data["status"] == "closed"
    assert data["exit_price"] == 440.0
    assert data["return_pct"] == pytest.approx(10.0, rel=1e-3)


def test_close_trade_negative_return(client):
    create = client.post("/api/trades", json={"ticker": "TSLA", "entry_price": 200.0})
    trade_id = create.json()["id"]

    close = client.put(
        f"/api/trades/{trade_id}/close",
        json={
            "exit_price": 180.0,
            "exit_reason": "hit_stop_loss",
        },
    )
    assert close.status_code == 200
    assert close.json()["return_pct"] < 0


def test_close_nonexistent_trade_returns_404(client):
    resp = client.put(
        "/api/trades/does-not-exist/close",
        json={
            "exit_price": 100.0,
            "exit_reason": "hit_target",
        },
    )
    assert resp.status_code == 404


def test_close_invalid_exit_reason_returns_400(client):
    create = client.post("/api/trades", json={"ticker": "GOOGL", "entry_price": 170.0})
    trade_id = create.json()["id"]
    resp = client.put(
        f"/api/trades/{trade_id}/close",
        json={
            "exit_price": 190.0,
            "exit_reason": "got_bored",
        },
    )
    assert resp.status_code == 400


def test_delete_trade(client):
    create = client.post("/api/trades", json={"ticker": "AMD", "entry_price": 150.0})
    trade_id = create.json()["id"]
    delete = client.delete(f"/api/trades/{trade_id}")
    assert delete.status_code == 204


def test_delete_nonexistent_trade_returns_404(client):
    resp = client.delete("/api/trades/does-not-exist")
    assert resp.status_code == 404


def test_close_trade_with_post_trade_notes(client):
    create = client.post("/api/trades", json={"ticker": "META", "entry_price": 500.0})
    trade_id = create.json()["id"]
    close = client.put(
        f"/api/trades/{trade_id}/close",
        json={"exit_price": 520.0, "exit_reason": "hit_target", "post_trade_notes": "clean exit"},
    )
    assert close.status_code == 200
    assert close.json()["post_trade_notes"] == "clean exit"


def test_update_trade_entry_price(client):
    create = client.post("/api/trades", json={"ticker": "AMZN", "entry_price": 180.0})
    trade_id = create.json()["id"]
    resp = client.put(f"/api/trades/{trade_id}", json={"entry_price": 185.0})
    assert resp.status_code == 200
    assert resp.json()["entry_price"] == 185.0


def test_update_nonexistent_trade_returns_404(client):
    resp = client.put("/api/trades/does-not-exist", json={"entry_price": 100.0})
    assert resp.status_code == 404


def test_update_trade_no_fields_returns_400(client):
    create = client.post("/api/trades", json={"ticker": "SPY", "entry_price": 500.0})
    trade_id = create.json()["id"]
    resp = client.put(f"/api/trades/{trade_id}", json={})
    assert resp.status_code == 400


def test_filter_by_ticker(client):
    client.post("/api/trades", json={"ticker": "UNIQUE123", "entry_price": 10.0})
    resp = client.get("/api/trades?ticker=UNIQUE123")
    assert resp.status_code == 200
    assert all(t["ticker"] == "UNIQUE123" for t in resp.json())


def test_filter_by_status(client):
    client.post("/api/trades", json={"ticker": "VGT", "entry_price": 420.0})
    resp = client.get("/api/trades?status=open")
    assert resp.status_code == 200
    assert all(t["status"] == "open" for t in resp.json())
