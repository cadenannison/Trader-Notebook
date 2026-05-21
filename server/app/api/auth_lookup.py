from fastapi import APIRouter, HTTPException
from supabase import create_client

from app.config import settings

router = APIRouter()


@router.get("/auth/lookup")
async def lookup_username(username: str):
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
