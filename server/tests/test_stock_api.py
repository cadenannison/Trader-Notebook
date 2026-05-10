"""
Stock API tests.

Verifies ticker validation rules and price endpoint shape.
Runs without a real Polygon key — falls back to mock data.
"""


# ── Ticker validation ─────────────────────────────────────────────────────────

def test_validate_known_ticker_returns_200(client):
    resp = client.get("/api/stock/validate?ticker=NVDA")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ticker"] == "NVDA"
    assert data["valid"] is True


def test_validate_ticker_is_case_insensitive(client):
    resp = client.get("/api/stock/validate?ticker=nvda")
    assert resp.status_code == 200
    assert resp.json()["ticker"] == "NVDA"


def test_validate_ticker_with_numbers_returns_400(client):
    resp = client.get("/api/stock/validate?ticker=AAPL1")
    assert resp.status_code == 400


def test_validate_ticker_too_long_returns_400(client):
    # More than 10 characters
    resp = client.get("/api/stock/validate?ticker=TOOLONGNAME")
    assert resp.status_code == 400


def test_validate_ticker_with_special_chars_returns_400(client):
    resp = client.get("/api/stock/validate?ticker=NV-DA")
    assert resp.status_code == 400


def test_validate_empty_ticker_returns_400(client):
    resp = client.get("/api/stock/validate?ticker=")
    assert resp.status_code == 400


# ── Price endpoint ────────────────────────────────────────────────────────────

def test_price_returns_200(client):
    resp = client.get("/api/stock/price?ticker=NVDA")
    assert resp.status_code == 200


def test_price_response_shape(client):
    resp = client.get("/api/stock/price?ticker=NVDA")
    data = resp.json()
    assert "ticker" in data
    assert "price" in data
    assert "timestamp" in data
    assert "change_pct" in data


def test_price_ticker_is_uppercased(client):
    resp = client.get("/api/stock/price?ticker=nvda")
    assert resp.status_code == 200
    assert resp.json()["ticker"] == "NVDA"


# ── Health ────────────────────────────────────────────────────────────────────

def test_health_returns_ok(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "configured" in data
