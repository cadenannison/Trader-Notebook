from app.config import settings
from app.crypto.keys import decrypt, derive_key


async def get_user_notes(ticker: str, user_id: str) -> list[str]:
    """Return decrypted note content strings for the insight agent."""
    if not (settings.supabase_url and settings.supabase_service_key):
        return [f"No notes available for {ticker} in dev mode."]

    try:
        from supabase import create_client
        sb = create_client(settings.supabase_url, settings.supabase_service_key)
        rows = (
            sb.table("notes")
            .select("encrypted_content")
            .eq("ticker", ticker.upper())
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(5)
            .execute()
            .data
        )
        key = derive_key(settings.master_key, user_id)
        return [decrypt(bytes.fromhex(r["encrypted_content"]), key) for r in rows]
    except Exception:
        return []
