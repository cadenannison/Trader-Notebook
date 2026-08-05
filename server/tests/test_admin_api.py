"""
Admin API tests (maintenance mode / kill switch).

Runs against the in-memory mock (no Supabase configured). Previously the
Settings UI toggle only flipped local, non-persisted Zustand state — it
never reached the backend, so the kill switch had zero effect on the
worker. These tests verify the toggle now round-trips through a real
endpoint.
"""


def test_get_maintenance_mode_defaults_false(client):
    resp = client.get("/api/admin/maintenance")
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False


def test_set_and_get_maintenance_mode(client):
    put_resp = client.put("/api/admin/maintenance", json={"enabled": True})
    assert put_resp.status_code == 200
    assert put_resp.json()["enabled"] is True

    get_resp = client.get("/api/admin/maintenance")
    assert get_resp.json()["enabled"] is True

    # reset so this test doesn't leak state into others in the same session
    client.put("/api/admin/maintenance", json={"enabled": False})
