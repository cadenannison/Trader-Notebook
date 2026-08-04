from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from supabase import create_client

from app.config import settings

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get("/auth/lookup")
@limiter.limit("10/minute")
async def lookup_username(username: str, request: Request):
    """Return the email for a given username (used by the login form). No auth required."""
    if not settings.supabase_url or not settings.supabase_service_key:
        raise HTTPException(status_code=404, detail="Username not found")

    try:
        admin = create_client(settings.supabase_url, settings.supabase_service_key)
        users = admin.auth.admin.list_users()
        for user in users:
            meta = user.user_metadata or {}
            if meta.get("username", "").lower() == username.strip().lower():
                return {"email": user.email}
    except Exception:
        pass

    raise HTTPException(status_code=404, detail="Username not found")
