from typing import Optional

import jwt
from jwt import PyJWKClient
from fastapi import Header, HTTPException

from app.config import settings

# Cached JWKS client — fetches Supabase's public key once and reuses it
_jwks_client: Optional[PyJWKClient] = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(
            f"{settings.supabase_url}/auth/v1/.well-known/jwks.json",
            cache_keys=True,
        )
    return _jwks_client


async def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    """Validate Supabase JWT and return the user's UUID.

    Supports ES256 (and HS256) via Supabase's JWKS endpoint.
    Falls back to a stable dev ID when SUPABASE_URL is not configured.
    """
    _DEV_USER_ID = "00000000-0000-0000-0000-000000000001"

    if not settings.supabase_url:
        return _DEV_USER_ID

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    token = authorization[len("Bearer "):]

    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256", "HS256"],
            audience="authenticated",
        )
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Auth error: {exc}")
