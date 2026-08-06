import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.crypto.keys import decrypt, derive_key, encrypt
from app.middleware.auth import get_current_user

router = APIRouter()

_mock_journal_notes: list[dict] = []


def _get_sb():
    if not (settings.supabase_url and settings.supabase_service_key):
        return None
    from supabase import create_client

    return create_client(settings.supabase_url, settings.supabase_service_key)


class CreateJournalNoteRequest(BaseModel):
    title: Optional[str] = None
    content: str
    tags: list[str] = []


class UpdateJournalNoteRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[list[str]] = None


def _normalize_tags(tags: list[str]) -> list[str]:
    return sorted({t.strip().upper() for t in tags if t.strip()})


def _decrypt_row(row: dict, key: bytes) -> dict:
    content = decrypt(bytes.fromhex(row["encrypted_content"]), key)
    return {
        "id": row["id"],
        "title": row.get("title"),
        "content": content,
        "tags": row.get("tags", []),
        "created_at": row["created_at"],
        "updated_at": row.get("updated_at", row["created_at"]),
    }


@router.get("/journal-notes")
async def get_journal_notes(
    tags: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    tag_list = [t.strip().upper() for t in tags.split(",") if t.strip()] if tags else []

    sb = _get_sb()
    if sb:
        q = (
            sb.table("journal_notes")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
        )
        if from_date:
            q = q.gte("created_at", from_date)
        if to_date:
            q = q.lte("created_at", to_date + "T23:59:59Z")
        if tag_list:
            q = q.contains("tags", tag_list)
        rows = q.execute().data
        key = derive_key(settings.master_key, user_id)
        return [_decrypt_row(r, key) for r in rows]

    notes = [n for n in _mock_journal_notes if n["user_id"] == user_id]
    if tag_list:
        notes = [n for n in notes if all(t in n["tags"] for t in tag_list)]
    return sorted(notes, key=lambda n: n["created_at"], reverse=True)


@router.post("/journal-notes", status_code=201)
async def create_journal_note(
    body: CreateJournalNoteRequest,
    user_id: str = Depends(get_current_user),
):
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="content is required")

    now = datetime.now(timezone.utc).isoformat()
    tags = _normalize_tags(body.tags)

    sb = _get_sb()
    if sb:
        key = derive_key(settings.master_key, user_id)
        encrypted = encrypt(body.content, key)
        try:
            row = (
                sb.table("journal_notes")
                .insert(
                    {
                        "user_id": user_id,
                        "title": body.title or None,
                        "encrypted_content": encrypted.hex(),
                        "tags": tags,
                        "created_at": now,
                        "updated_at": now,
                    }
                )
                .execute()
                .data[0]
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to save note: {exc}")
        return _decrypt_row(row, key)

    note = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "title": body.title or None,
        "content": body.content,
        "tags": tags,
        "created_at": now,
        "updated_at": now,
    }
    _mock_journal_notes.append(note)
    return {k: v for k, v in note.items() if k != "user_id"}


@router.put("/journal-notes/{note_id}")
async def update_journal_note(
    note_id: str,
    body: UpdateJournalNoteRequest,
    user_id: str = Depends(get_current_user),
):
    now = datetime.now(timezone.utc).isoformat()

    sb = _get_sb()
    if sb:
        updates: dict = {"updated_at": now}
        if body.title is not None:
            updates["title"] = body.title or None
        if body.tags is not None:
            updates["tags"] = _normalize_tags(body.tags)
        key = derive_key(settings.master_key, user_id)
        if body.content is not None:
            updates["encrypted_content"] = encrypt(body.content, key).hex()
        result = (
            sb.table("journal_notes")
            .update(updates)
            .eq("id", note_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Note not found")
        return _decrypt_row(result.data[0], key)

    for note in _mock_journal_notes:
        if note["id"] == note_id and note["user_id"] == user_id:
            if body.title is not None:
                note["title"] = body.title or None
            if body.content is not None:
                note["content"] = body.content
            if body.tags is not None:
                note["tags"] = _normalize_tags(body.tags)
            note["updated_at"] = now
            return {k: v for k, v in note.items() if k != "user_id"}
    raise HTTPException(status_code=404, detail="Note not found")


@router.delete("/journal-notes/{note_id}", status_code=204)
async def delete_journal_note(note_id: str, user_id: str = Depends(get_current_user)):
    global _mock_journal_notes
    sb = _get_sb()
    if sb:
        result = (
            sb.table("journal_notes").delete().eq("id", note_id).eq("user_id", user_id).execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Note not found")
        return

    before = len(_mock_journal_notes)
    _mock_journal_notes = [
        n for n in _mock_journal_notes if not (n["id"] == note_id and n["user_id"] == user_id)
    ]
    if len(_mock_journal_notes) == before:
        raise HTTPException(status_code=404, detail="Note not found")


async def get_notes_context(user_id: str) -> str:
    """Return a compact summary of recent journal notes for AI context."""
    sb = _get_sb()
    if not sb:
        return ""
    try:
        rows = (
            sb.table("journal_notes")
            .select("title, encrypted_content, tags, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(8)
            .execute()
            .data
        )
        if not rows:
            return ""
        from app.config import settings as _s

        key = derive_key(_s.master_key, user_id)
        lines = []
        for r in rows:
            content = decrypt(bytes.fromhex(r["encrypted_content"]), key)
            date = r["created_at"][:10]
            tags_str = ", ".join(r["tags"]) if r["tags"] else "general"
            title = r.get("title") or "(untitled)"
            lines.append(f"[{date}] {title} [{tags_str}]: {content[:180]}")
        return "Recent journal notes:\n" + "\n".join(lines)
    except Exception:
        return ""
