"""
Portfolios API tests.

Runs against the in-memory mock (no Supabase configured).
Verifies API contract: shapes, status codes, CRUD.
"""


def test_get_portfolios_returns_list(client):
    resp = client.get("/api/portfolios")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_create_portfolio_returns_201(client):
    resp = client.post("/api/portfolios", json={"name": "AI Infrastructure"})
    assert resp.status_code == 201


def test_create_portfolio_response_shape(client):
    resp = client.post(
        "/api/portfolios",
        json={"name": "Tech Growth", "thesis": "Betting on cloud + AI through 2027"},
    )
    data = resp.json()
    assert "id" in data
    assert data["name"] == "Tech Growth"
    assert data["thesis"] == "Betting on cloud + AI through 2027"
    assert "created_at" in data


def test_create_portfolio_missing_name_returns_422(client):
    resp = client.post("/api/portfolios", json={"thesis": "no name"})
    assert resp.status_code == 422


def test_create_portfolio_thesis_optional(client):
    resp = client.post("/api/portfolios", json={"name": "No Thesis"})
    assert resp.status_code == 201
    assert resp.json()["thesis"] is None


def test_update_portfolio_name(client):
    create = client.post("/api/portfolios", json={"name": "Old Name"})
    portfolio_id = create.json()["id"]
    resp = client.put(f"/api/portfolios/{portfolio_id}", json={"name": "New Name"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


def test_update_portfolio_thesis(client):
    create = client.post("/api/portfolios", json={"name": "My Portfolio"})
    portfolio_id = create.json()["id"]
    resp = client.put(f"/api/portfolios/{portfolio_id}", json={"thesis": "updated thesis"})
    assert resp.status_code == 200
    assert resp.json()["thesis"] == "updated thesis"


def test_update_nonexistent_portfolio_returns_404(client):
    resp = client.put("/api/portfolios/does-not-exist", json={"name": "X"})
    assert resp.status_code == 404


def test_delete_portfolio_returns_204(client):
    create = client.post("/api/portfolios", json={"name": "To Delete"})
    portfolio_id = create.json()["id"]
    resp = client.delete(f"/api/portfolios/{portfolio_id}")
    assert resp.status_code == 204


def test_delete_nonexistent_portfolio_returns_404(client):
    resp = client.delete("/api/portfolios/does-not-exist")
    assert resp.status_code == 404


def test_create_then_list(client):
    client.post("/api/portfolios", json={"name": "Listed Portfolio"})
    resp = client.get("/api/portfolios")
    names = [p["name"] for p in resp.json()]
    assert "Listed Portfolio" in names
