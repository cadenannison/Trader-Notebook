import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.middleware.auth import get_current_user

router = APIRouter()

# In-memory store for mock mode. TODO: replace with Supabase client.
_mock_notes: list[dict] = [
    {
        "id": "note-1",
        "user_id": "mock-user-id-dev",
        "ticker": "NVDA",
        "content": "Strong AI demand is driving data center growth. Jensen's roadmap looks credible — Blackwell compelling for next 18 months.",
        "created_at": "2026-04-20T10:23:00Z",
    },
    {
        "id": "note-2",
        "user_id": "mock-user-id-dev",
        "ticker": "NVDA",
        "content": "Concerned about export restrictions to China eating into margins. Need to watch guidance on next earnings call.",
        "created_at": "2026-04-15T14:05:00Z",
    },
    {
        "id": "note-3",
        "user_id": "mock-user-id-dev",
        "ticker": "VGT",
        "content": "Tech sector consolidation looks healthy. VGT gives broad exposure without single-stock concentration risk.",
        "created_at": "2026-04-12T09:00:00Z",
    },
    {
        "id": "note-4",
        "user_id": "mock-user-id-dev",
        "ticker": "AAPL",
        "content": "Services revenue is the story now. Hardware growth plateaued but services margins are exceptional.",
        "created_at": "2026-04-10T16:30:00Z",
    },
]


class CreateNoteRequest(BaseModel):
    ticker: str
    content: str


@router.post("/notes", status_code=201)
async def create_note(
    body: CreateNoteRequest,
    user_id: str = Depends(get_current_user),
):
    """Create a note. Notes are immutable — no edit endpoint.
    TODO: encrypt body.content before storing in Supabase.
    """
    note = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "ticker": body.ticker.upper(),
        "content": body.content,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _mock_notes.append(note)
    return note


@router.get("/notes")
async def get_notes(
    ticker: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    """Return notes for the current user, optionally filtered by ticker.
    TODO: fetch from Supabase and decrypt content.
    """
    notes = [n for n in _mock_notes if n["user_id"] == user_id]
    if ticker:
        notes = [n for n in notes if n["ticker"] == ticker.upper()]
    return sorted(notes, key=lambda n: n["created_at"], reverse=True)
