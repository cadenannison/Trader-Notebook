from fastapi import APIRouter, Depends

from app.api.notes import _mock_notes
from app.api.triggers import _mock_triggers
from app.middleware.auth import get_current_user

router = APIRouter()


@router.get("/user/export")
async def export_user_data(user_id: str = Depends(get_current_user)):
    """Export all user data as JSON. TODO: decrypt notes before export."""
    notes = [n for n in _mock_notes if n["user_id"] == user_id]
    triggers = [t for t in _mock_triggers if t["user_id"] == user_id]
    return {
        "user_id": user_id,
        "notes": notes,
        "triggers": triggers,
        "exported_at": "2026-04-30T00:00:00Z",
    }


@router.delete("/user/me", status_code=204)
async def delete_account(user_id: str = Depends(get_current_user)):
    """Delete all user data and auth record.
    TODO: cascade delete in Supabase + supabase.auth.admin.delete_user(user_id)
    """
    pass
