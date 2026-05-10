from typing import Optional

from fastapi import Header, HTTPException
from jose import JWTError, jwt

from app.config import settings


async def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    """Validate Supabase JWT and return the user's UUID.

    Falls back to a stable dev ID when SUPABASE_JWT_SECRET is not set,
    so the server works fully without auth during local development.
    """
    _DEV_USER_ID = "00000000-0000-0000-0000-000000000001"

    if not settings.supabase_jwt_secret:
        return _DEV_USER_ID

    if not authorization or not authorization.startswith("Bearer "):
        if settings.supabase_jwt_secret:
            raise HTTPException(status_code=401, detail="Missing Authorization header")
        return _DEV_USER_ID

    token = authorization[len("Bearer "):]
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload["sub"]
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")
