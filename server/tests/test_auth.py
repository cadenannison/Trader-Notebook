"""
Auth middleware tests.

Verifies that:
- Without SUPABASE_URL, requests fall through to dev mode (no 401)
- With SUPABASE_URL set, missing/invalid tokens are rejected with 401
- A correctly signed HS256 token (via mocked JWKS client) is accepted
"""

from unittest.mock import MagicMock, patch

import jwt as pyjwt

from app.config import settings

_TEST_SECRET = "test-jwt-secret-for-unit-tests-only"  # pragma: allowlist secret
_FAKE_SUPABASE_URL = "https://fake-project.supabase.co"


def _make_token(
    user_id: str = "test-user-123", secret: str = _TEST_SECRET, aud: str = "authenticated"
) -> str:
    return pyjwt.encode({"sub": user_id, "aud": aud}, secret, algorithm="HS256")


def _mock_jwks(secret: str = _TEST_SECRET) -> MagicMock:
    """Return a mock PyJWKClient whose get_signing_key_from_jwt returns the given secret."""
    signing_key = MagicMock()
    signing_key.key = secret
    client = MagicMock()
    client.get_signing_key_from_jwt.return_value = signing_key
    return client


# ── Dev mode (no SUPABASE_URL configured) ────────────────────────────────────


def test_dev_mode_no_header_allowed(client):
    resp = client.get("/api/notes")
    assert resp.status_code == 200


def test_dev_mode_bad_token_still_allowed(client):
    resp = client.get("/api/notes", headers={"Authorization": "Bearer garbage"})
    assert resp.status_code == 200


# ── Production mode (SUPABASE_URL set, JWKS mocked) ──────────────────────────


def test_missing_auth_header_returns_401(client):
    with patch.object(settings, "supabase_url", _FAKE_SUPABASE_URL):
        resp = client.get("/api/notes")
    assert resp.status_code == 401


def test_bearer_prefix_is_required(client):
    token = _make_token()
    with patch.object(settings, "supabase_url", _FAKE_SUPABASE_URL):
        resp = client.get("/api/notes", headers={"Authorization": token})
    assert resp.status_code == 401


def test_malformed_token_returns_401(client):
    with patch.object(settings, "supabase_url", _FAKE_SUPABASE_URL):
        with patch("app.middleware.auth._get_jwks_client", return_value=_mock_jwks()):
            resp = client.get("/api/notes", headers={"Authorization": "Bearer not.a.real.token"})
    assert resp.status_code == 401


def test_token_signed_with_wrong_secret_returns_401(client):
    token = _make_token(secret="completely-wrong-secret")
    with patch.object(settings, "supabase_url", _FAKE_SUPABASE_URL):
        with patch("app.middleware.auth._get_jwks_client", return_value=_mock_jwks(_TEST_SECRET)):
            resp = client.get("/api/notes", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


def test_token_with_wrong_audience_returns_401(client):
    token = _make_token(aud="anon")
    with patch.object(settings, "supabase_url", _FAKE_SUPABASE_URL):
        with patch("app.middleware.auth._get_jwks_client", return_value=_mock_jwks()):
            resp = client.get("/api/notes", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


def test_valid_token_is_accepted(client):
    token = _make_token()
    with patch.object(settings, "supabase_url", _FAKE_SUPABASE_URL):
        with patch("app.middleware.auth._get_jwks_client", return_value=_mock_jwks()):
            resp = client.get("/api/notes", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
