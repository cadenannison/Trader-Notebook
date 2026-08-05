from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.config import settings
from app.middleware.auth import get_current_user

router = APIRouter()


@router.get("/user/export")
async def export_user_data(user_id: str = Depends(get_current_user)):
    """Export all user data as decrypted JSON."""
    if not settings.supabase_url:
        return {
            "user_id": user_id,
            "notes": [],
            "triggers": [],
            "trades": [],
            "watchlist": [],
            "journal_notes": [],
            "portfolios": [],
            "exported_at": datetime.now(timezone.utc).isoformat(),
        }

    from supabase import create_client
    from app.crypto.keys import derive_key, decrypt

    sb = create_client(settings.supabase_url, settings.supabase_service_key)
    key = derive_key(settings.master_key, user_id)

    # Notes — decrypt each one
    raw_notes = sb.table("notes").select("*").eq("user_id", user_id).execute().data or []
    notes = []
    for n in raw_notes:
        try:
            content = decrypt(bytes.fromhex(n["encrypted_content"]), key)
        except Exception:
            content = "[decryption failed]"
        notes.append(
            {
                "id": n["id"],
                "ticker": n["ticker"],
                "content": content,
                "created_at": n["created_at"],
            }
        )

    triggers = sb.table("triggers").select("*").eq("user_id", user_id).execute().data or []
    trades = sb.table("trades").select("*").eq("user_id", user_id).execute().data or []
    watchlist = (
        sb.table("watchlist_entries").select("*").eq("user_id", user_id).execute().data or []
    )
    portfolios = sb.table("portfolios").select("*").eq("user_id", user_id).execute().data or []

    # Journal notes — decrypt
    raw_jnotes = sb.table("journal_notes").select("*").eq("user_id", user_id).execute().data or []
    journal_notes = []
    for jn in raw_jnotes:
        try:
            content = decrypt(bytes.fromhex(jn["encrypted_content"]), key)
        except Exception:
            content = "[decryption failed]"
        journal_notes.append(
            {
                "id": jn["id"],
                "title": jn.get("title", ""),
                "content": content,
                "tags": jn.get("tags", []),
                "created_at": jn["created_at"],
                "updated_at": jn.get("updated_at"),
            }
        )

    return {
        "user_id": user_id,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "notes": notes,
        "triggers": triggers,
        "trades": trades,
        "watchlist": watchlist,
        "portfolios": portfolios,
        "journal_notes": journal_notes,
    }


@router.delete("/user/me", status_code=204)
async def delete_account(user_id: str = Depends(get_current_user)):
    """Delete all user data and the Supabase auth record."""
    if not settings.supabase_url:
        return

    from supabase import create_client

    sb = create_client(settings.supabase_url, settings.supabase_service_key)

    # Delete data tables (RLS-protected; service key bypasses for cleanup)
    for table in [
        "notes",
        "triggers",
        "trades",
        "watchlist_entries",
        "portfolios",
        "journal_notes",
        "agent_audit_logs",
    ]:
        try:
            sb.table(table).delete().eq("user_id", user_id).execute()
        except Exception:
            pass

    # Delete the Supabase auth user
    try:
        sb.auth.admin.delete_user(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete auth user: {e}")
