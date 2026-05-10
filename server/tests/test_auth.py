"""
Auth middleware tests.

Verifies that:
- Without SUPABASE_JWT_SECRET, requests fall through to dev mode (no 401)
- With SUPABASE_JWT_SECRET set, missing/invalid tokens are rejected with 401
- A correctly signed token is accepted
"""

from unittest.mock import patch

from jose import jwt

from app.config import settings

_TEST_SECRET = "test-jwt-secret-for-unit-tests-only"


def _make_token(user_id: str = "test-user-123", secret: str = _TEST_SECRET) -> str:
    return jwt.encode({"sub": user_id, "aud": "authenticated"}, secret, algorithm="HS256")


# ── Dev mode (no JWT secret configured) ──────────────────────────────────────

def test_dev_mode_no_header_allowed(client):
    with patch.object(settings, "supabase_jwt_secret", ""):
        resp = client.get("/api/notes")
    assert resp.status_code == 200


def test_dev_mode_bad_token_still_allowed(client):
    with patch.object(settings, "supabase_jwt_secret", ""):
        resp = client.get("/api/notes", headers={"Authorization": "Bearer garbage"})
    assert resp.status_code == 200


# ── Production mode (JWT secret configured) ───────────────────────────────────

def test_missing_auth_header_returns_401(client):
    with patch.object(settings, "supabase_jwt_secret", _TEST_SECRET):
        resp = client.get("/api/notes")
    assert resp.status_code == 401


def test_malformed_token_returns_401(client):
    with patch.object(settings, "supabase_jwt_secret", _TEST_SECRET):
        resp = client.get("/api/notes", headers={"Authorization": "Bearer not.a.real.token"})
    assert resp.status_code == 401


def test_token_signed_with_wrong_secret_returns_401(client):
    token = _make_token(secret="completely-wrong-secret")
    with patch.object(settings, "supabase_jwt_secret", _TEST_SECRET):
        resp = client.get("/api/notes", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


def test_token_with_wrong_audience_returns_401(client):
    token = jwt.encode({"sub": "user-123", "aud": "anon"}, _TEST_SECRET, algorithm="HS256")
    with patch.object(settings, "supabase_jwt_secret", _TEST_SECRET):
        resp = client.get("/api/notes", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


def test_valid_token_is_accepted(client):
    token = _make_token()
    with patch.object(settings, "supabase_jwt_secret", _TEST_SECRET):
        resp = client.get("/api/notes", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


def test_bearer_prefix_is_required(client):
    token = _make_token()
    with patch.object(settings, "supabase_jwt_secret", _TEST_SECRET):
        resp = client.get("/api/notes", headers={"Authorization": token})
    assert resp.status_code == 401
