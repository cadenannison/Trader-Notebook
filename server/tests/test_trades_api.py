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


# ── Regression: close_trade must reject re-closing an already-closed trade ──


def test_close_already_closed_trade_returns_409(client):
    create = client.post("/api/trades", json={"ticker": "CLSD1", "entry_price": 100.0})
    trade_id = create.json()["id"]
    first_close = client.put(
        f"/api/trades/{trade_id}/close",
        json={"exit_price": 110.0, "exit_reason": "hit_target"},
    )
    assert first_close.status_code == 200

    second_close = client.put(
        f"/api/trades/{trade_id}/close",
        json={"exit_price": 50.0, "exit_reason": "panic_sold"},
    )
    assert second_close.status_code == 409

    # The original close must be untouched — no silent P&L corruption.
    unchanged = client.get("/api/trades?ticker=CLSD1").json()[0]
    assert unchanged["exit_price"] == 110.0
    assert unchanged["exit_reason"] == "hit_target"


# ── Regression: update_trade must not be able to set exit fields on an open
# trade (that would desync `status` from `exit_price`, the two different
# "is this trade open" signals other features rely on) — must use close_trade.


def test_update_trade_cannot_set_exit_price_on_open_trade(client):
    create = client.post("/api/trades", json={"ticker": "DESYNC1", "entry_price": 100.0})
    trade_id = create.json()["id"]

    resp = client.put(f"/api/trades/{trade_id}", json={"exit_price": 120.0})
    assert resp.status_code == 400

    resp2 = client.put(f"/api/trades/{trade_id}", json={"exit_reason": "hit_target"})
    assert resp2.status_code == 400

    # Confirm it's genuinely untouched — still open, no exit fields set.
    still_open = client.get("/api/trades?ticker=DESYNC1").json()[0]
    assert still_open["status"] == "open"
    assert still_open["exit_price"] is None


def test_update_trade_can_still_correct_exit_price_on_closed_trade(client):
    """Editing a CLOSED trade's exit_price is legitimate (fixing a mistake in
    the record) and must keep working — only OPEN trades are guarded."""
    create = client.post("/api/trades", json={"ticker": "FIXCLOSED1", "entry_price": 100.0})
    trade_id = create.json()["id"]
    client.put(
        f"/api/trades/{trade_id}/close",
        json={"exit_price": 110.0, "exit_reason": "hit_target"},
    )

    resp = client.put(f"/api/trades/{trade_id}", json={"exit_price": 115.0})
    assert resp.status_code == 200
    assert resp.json()["exit_price"] == 115.0
    assert resp.json()["return_pct"] == pytest.approx(15.0, rel=1e-3)


# ── Regression: deleting an open trade must revert its linked watchlist
# entry out of "active_trade" — otherwise the watchlist card is stuck
# showing a live position with no backing trade.


def test_delete_open_trade_reverts_linked_watchlist_entry_to_watching(client):
    watchlist_resp = client.post(
        "/api/watchlist",
        json={"ticker": "REVERT1", "reasoning": "test thesis"},
    )
    entry_id = watchlist_resp.json()["id"]
    assert watchlist_resp.json()["status"] == "watching"

    trade_resp = client.post(
        "/api/trades",
        json={"ticker": "REVERT1", "entry_price": 50.0, "watchlist_entry_id": entry_id},
    )
    trade_id = trade_resp.json()["id"]

    # create_trade should have flipped the linked entry to active_trade.
    mid_entry = client.get("/api/watchlist?ticker=REVERT1").json()[0]
    assert mid_entry["status"] == "active_trade"

    delete_resp = client.delete(f"/api/trades/{trade_id}")
    assert delete_resp.status_code == 204

    after_entry = client.get("/api/watchlist?ticker=REVERT1").json()[0]
    assert after_entry["status"] == "watching"


def test_update_trade_can_clear_optional_fields(client):
    """A client explicitly sending null for shares/cost_basis/pre_trade_notes
    is asking to clear them — filtering on `v is not None` after model_dump()
    couldn't distinguish that from the field never being mentioned, so the
    clear silently no-op'd. exclude_unset fixes this."""
    create = client.post(
        "/api/trades",
        json={
            "ticker": "CLR1",
            "entry_price": 100.0,
            "shares": 10,
            "cost_basis": 950.0,
            "pre_trade_notes": "original notes",
        },
    )
    trade_id = create.json()["id"]
    assert create.json()["shares"] == 10
    assert create.json()["pre_trade_notes"] == "original notes"

    resp = client.put(
        f"/api/trades/{trade_id}",
        json={"shares": None, "cost_basis": None, "pre_trade_notes": None},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["shares"] is None
    assert data["cost_basis"] is None
    assert data["pre_trade_notes"] is None


def test_update_trade_omitted_fields_untouched(client):
    """Fields the client never mentions must stay untouched — exclude_unset
    should only pick up keys actually present in the request body."""
    create = client.post(
        "/api/trades",
        json={"ticker": "CLR2", "entry_price": 100.0, "shares": 5},
    )
    trade_id = create.json()["id"]

    resp = client.put(f"/api/trades/{trade_id}", json={"cost_basis": 500.0})
    assert resp.status_code == 200
    data = resp.json()
    assert data["cost_basis"] == 500.0
    assert data["shares"] == 5  # untouched, not wiped out


def test_create_trade_rejects_second_open_trade_on_same_watchlist_entry(client):
    """Two open trades linked to the same watchlist entry desyncs the entry's
    status once either one is closed/deleted (the other silently orphaned) —
    the same bug class already fixed for close_trade double-close."""
    watchlist_resp = client.post(
        "/api/watchlist",
        json={"ticker": "DUP1", "reasoning": "test thesis"},
    )
    entry_id = watchlist_resp.json()["id"]

    first = client.post(
        "/api/trades",
        json={"ticker": "DUP1", "entry_price": 50.0, "watchlist_entry_id": entry_id},
    )
    assert first.status_code == 201

    second = client.post(
        "/api/trades",
        json={"ticker": "DUP1", "entry_price": 51.0, "watchlist_entry_id": entry_id},
    )
    assert second.status_code == 409
