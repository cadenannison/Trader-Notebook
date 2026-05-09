async def get_user_notes(ticker: str, user_id: str) -> list[str]:
    """Fetch and decrypt user notes for a ticker. Returns plaintext strings.

    TODO:
        rows = await supabase.table("notes")
            .select("encrypted_content")
            .eq("ticker", ticker)
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(5)
            .execute()
        key = derive_key(settings.master_key, user_id)
        return [decrypt(row["encrypted_content"], key) for row in rows.data]
    """
    return [
        f"[MOCK] Strong AI demand driving {ticker} data center growth.",
        f"[MOCK] Watching {ticker} for export restriction impact on margins.",
    ]
