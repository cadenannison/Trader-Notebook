from typing import Optional

from fastapi import Header


async def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    """JWT validation stub — returns a mock user ID for development.

    TODO: validate the Supabase JWT against the JWKS endpoint:
        token = authorization.replace("Bearer ", "")
        payload = verify_supabase_jwt(token, SUPABASE_JWT_SECRET)
        return payload["sub"]
    """
    return "mock-user-id-dev"
