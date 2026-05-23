import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import settings
from app.crypto.keys import decrypt, derive_key, encrypt
from app.middleware.auth import get_current_user

router = APIRouter()

_mock_notes: list[dict] = [
    {
        "id": "note-1",
        "user_id": "dev-user-id",
        "ticker": "NVDA",
        "content": "Strong AI demand driving data center growth. Jensen's roadmap looks credible — Blackwell compelling for next 18 months.",
        "created_at": "2026-04-20T10:23:00Z",
    },
    {
        "id": "note-2",
        "user_id": "dev-user-id",
        "ticker": "NVDA",
        "content": "Concerned about export restrictions to China eating into margins. Watch guidance on next earnings call.",
        "created_at": "2026-04-15T14:05:00Z",
    },
    {
        "id": "note-3",
        "user_id": "dev-user-id",
        "ticker": "VGT",
        "content": "Tech sector consolidation looks healthy. VGT gives broad exposure without single-stock concentration risk.",
        "created_at": "2026-04-12T09:00:00Z",
    },
    {
        "id": "note-4",
        "user_id": "dev-user-id",
        "ticker": "AAPL",
        "content": "Services revenue is the story now. Hardware growth plateaued but services margins are exceptional.",
        "created_at": "2026-04-10T16:30:00Z",
    },
]


def _get_sb():
    if not (settings.supabase_url and settings.supabase_service_key):
        return None
    from supabase import create_client

    return create_client(settings.supabase_url, settings.supabase_service_key)


class CreateNoteRequest(BaseModel):
    ticker: str
    content: str


@router.post("/notes", status_code=201)
async def create_note(body: CreateNoteRequest, user_id: str = Depends(get_current_user)):
    sb = _get_sb()
    now = datetime.now(timezone.utc).isoformat()
    ticker = body.ticker.upper()

    if sb:
        key = derive_key(settings.master_key, user_id)
        encrypted = encrypt(body.content, key)
        row = (
            sb.table("notes")
            .insert(
                {
                    "user_id": user_id,
                    "ticker": ticker,
                    "encrypted_content": encrypted.hex(),
                    "created_at": now,
                }
            )
            .execute()
            .data[0]
        )
        return {"id": row["id"], "ticker": ticker, "content": body.content, "created_at": now}

    note = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "ticker": ticker,
        "content": body.content,
        "created_at": now,
    }
    _mock_notes.append(note)
    return note


@router.get("/notes")
async def get_notes(ticker: Optional[str] = None, user_id: str = Depends(get_current_user)):
    sb = _get_sb()

    if sb:
        q = sb.table("notes").select("*").eq("user_id", user_id).order("created_at", desc=True)
        if ticker:
            q = q.eq("ticker", ticker.upper())
        rows = q.execute().data
        key = derive_key(settings.master_key, user_id)
        return [
            {
                "id": r["id"],
                "ticker": r["ticker"],
                "content": decrypt(bytes.fromhex(r["encrypted_content"]), key),
                "created_at": r["created_at"],
            }
            for r in rows
        ]

    notes = [n for n in _mock_notes if n["user_id"] == user_id]
    if ticker:
        notes = [n for n in notes if n["ticker"] == ticker.upper()]
    return sorted(notes, key=lambda n: n["created_at"], reverse=True)
