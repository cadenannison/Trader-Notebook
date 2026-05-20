import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.middleware.auth import get_current_user

router = APIRouter()

_mock_watchlist: list[dict] = []


def _get_sb():
    if not (settings.supabase_url and settings.supabase_service_key):
        return None
    from supabase import create_client
    return create_client(settings.supabase_url, settings.supabase_service_key)


class CreateWatchlistRequest(BaseModel):
    ticker: str
    reasoning: str
    idea_source: str = "own_research"
    time_horizon: str = "swing"
    entry_price: Optional[float] = None
    target_price: Optional[float] = None
    stop_price: Optional[float] = None


class UpdateWatchlistRequest(BaseModel):
    reasoning: Optional[str] = None
    idea_source: Optional[str] = None
    time_horizon: Optional[str] = None
    entry_price: Optional[float] = None
    target_price: Optional[float] = None
    stop_price: Optional[float] = None
    status: Optional[str] = None


_VALID_IDEA_SOURCES = {
    "own_research", "tip", "news", "chart_pattern", "earnings_catalyst", "gut"
}
_VALID_HORIZONS = {"intraday", "swing", "position"}
_VALID_STATUSES = {"watching", "active_trade", "completed", "expired"}


@router.get("/watchlist")
async def get_watchlist(
    status: Optional[str] = None,
    ticker: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    sb = _get_sb()
    if sb:
        q = (
            sb.table("watchlist_entries")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
        )
        if status:
            q = q.eq("status", status)
        if ticker:
            q = q.eq("ticker", ticker.upper())
        return q.execute().data

    result = [e for e in _mock_watchlist if e["user_id"] == user_id]
    if status:
        result = [e for e in result if e["status"] == status]
    if ticker:
        result = [e for e in result if e["ticker"] == ticker.upper()]
    return result


@router.post("/watchlist", status_code=201)
async def create_watchlist_entry(
    body: CreateWatchlistRequest,
    user_id: str = Depends(get_current_user),
):
    if body.idea_source not in _VALID_IDEA_SOURCES:
        raise HTTPException(
            status_code=400,
            detail=f"idea_source must be one of: {', '.join(sorted(_VALID_IDEA_SOURCES))}",
        )
    if body.time_horizon not in _VALID_HORIZONS:
        raise HTTPException(
            status_code=400,
            detail=f"time_horizon must be one of: {', '.join(sorted(_VALID_HORIZONS))}",
        )

    now = datetime.now(timezone.utc).isoformat()
    row = {
        "user_id": user_id,
        "ticker": body.ticker.upper(),
        "reasoning": body.reasoning,
        "idea_source": body.idea_source,
        "time_horizon": body.time_horizon,
        "entry_price": body.entry_price,
        "target_price": body.target_price,
        "stop_price": body.stop_price,
        "status": "watching",
        "created_at": now,
        "updated_at": now,
    }

    sb = _get_sb()
    if sb:
        return sb.table("watchlist_entries").insert(row).execute().data[0]

    entry = {"id": str(uuid.uuid4()), **row}
    _mock_watchlist.append(entry)
    return entry


@router.put("/watchlist/{entry_id}")
async def update_watchlist_entry(
    entry_id: str,
    body: UpdateWatchlistRequest,
    user_id: str = Depends(get_current_user),
):
    updates: dict = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "idea_source" in updates and updates["idea_source"] not in _VALID_IDEA_SOURCES:
        raise HTTPException(status_code=400, detail="Invalid idea_source")
    if "time_horizon" in updates and updates["time_horizon"] not in _VALID_HORIZONS:
        raise HTTPException(status_code=400, detail="Invalid time_horizon")
    if "status" in updates and updates["status"] not in _VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")

    sb = _get_sb()
    if sb:
        result = (
            sb.table("watchlist_entries")
            .update(updates)
            .eq("id", entry_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Entry not found")
        return result.data[0]

    for entry in _mock_watchlist:
        if entry["id"] == entry_id and entry["user_id"] == user_id:
            entry.update(updates)
            entry["updated_at"] = datetime.now(timezone.utc).isoformat()
            return entry
    raise HTTPException(status_code=404, detail="Entry not found")


@router.delete("/watchlist/{entry_id}", status_code=204)
async def delete_watchlist_entry(
    entry_id: str,
    user_id: str = Depends(get_current_user),
):
    global _mock_watchlist
    sb = _get_sb()
    if sb:
        result = (
            sb.table("watchlist_entries")
            .delete()
            .eq("id", entry_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Entry not found")
        return

    before = len(_mock_watchlist)
    _mock_watchlist = [
        e for e in _mock_watchlist
        if not (e["id"] == entry_id and e["user_id"] == user_id)
    ]
    if len(_mock_watchlist) == before:
        raise HTTPException(status_code=404, detail="Entry not found")
