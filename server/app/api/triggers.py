import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.middleware.auth import get_current_user

router = APIRouter()

_mock_triggers: list[dict] = [
    {"id": "trigger-1", "user_id": "dev-user-id", "ticker": "NVDA",
     "target_price": 900.00, "condition": "above", "is_active": True,
     "auto_disarm": True, "cooldown_hours": 4, "last_triggered_at": None,
     "created_at": "2026-04-25T08:00:00Z"},
    {"id": "trigger-2", "user_id": "dev-user-id", "ticker": "NVDA",
     "target_price": 800.00, "condition": "below", "is_active": False,
     "auto_disarm": True, "cooldown_hours": 4,
     "last_triggered_at": "2026-04-28T11:00:00Z", "created_at": "2026-04-20T12:00:00Z"},
    {"id": "trigger-3", "user_id": "dev-user-id", "ticker": "VGT",
     "target_price": 450.00, "condition": "above", "is_active": True,
     "auto_disarm": False, "cooldown_hours": 8, "last_triggered_at": None,
     "created_at": "2026-04-22T09:30:00Z"},
]


def _get_sb():
    if not (settings.supabase_url and settings.supabase_service_key):
        return None
    from supabase import create_client
    return create_client(settings.supabase_url, settings.supabase_service_key)


class CreateTriggerRequest(BaseModel):
    ticker: str
    target_price: float
    condition: str
    auto_disarm: bool = True
    cooldown_hours: int = 4
    notes: Optional[str] = None
    portfolio_id: Optional[str] = None


class UpdateTriggerRequest(BaseModel):
    target_price: Optional[float] = None
    condition: Optional[str] = None
    auto_disarm: Optional[bool] = None
    cooldown_hours: Optional[int] = None
    notes: Optional[str] = None
    portfolio_id: Optional[str] = None


@router.get("/triggers")
async def get_triggers(ticker: Optional[str] = None, user_id: str = Depends(get_current_user)):
    sb = _get_sb()
    if sb:
        q = sb.table("triggers").select("*").eq("user_id", user_id).order("created_at", desc=True)
        if ticker:
            q = q.eq("ticker", ticker.upper())
        return q.execute().data

    result = [t for t in _mock_triggers if t["user_id"] == user_id]
    if ticker:
        result = [t for t in result if t["ticker"] == ticker.upper()]
    return result


@router.post("/triggers", status_code=201)
async def create_trigger(body: CreateTriggerRequest, user_id: str = Depends(get_current_user)):
    if body.condition not in ("above", "below"):
        raise HTTPException(status_code=400, detail="condition must be 'above' or 'below'")
    sb = _get_sb()
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "user_id": user_id, "ticker": body.ticker.upper(),
        "target_price": body.target_price, "condition": body.condition,
        "is_active": True, "auto_disarm": body.auto_disarm,
        "cooldown_hours": body.cooldown_hours, "last_triggered_at": None, "created_at": now,
        "notes": body.notes, "portfolio_id": body.portfolio_id,
    }
    if sb:
        return sb.table("triggers").insert(row).execute().data[0]

    trigger = {"id": str(uuid.uuid4()), **row}
    _mock_triggers.append(trigger)
    return trigger


@router.put("/triggers/{trigger_id}/rearm")
async def rearm_trigger(trigger_id: str, user_id: str = Depends(get_current_user)):
    sb = _get_sb()
    if sb:
        result = sb.table("triggers").update(
            {"is_active": True, "last_triggered_at": None}
        ).eq("id", trigger_id).eq("user_id", user_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Trigger not found")
        return result.data[0]

    for t in _mock_triggers:
        if t["id"] == trigger_id and t["user_id"] == user_id:
            t["is_active"] = True
            t["last_triggered_at"] = None
            return t
    raise HTTPException(status_code=404, detail="Trigger not found")


@router.delete("/triggers/{trigger_id}", status_code=204)
async def delete_trigger(trigger_id: str, user_id: str = Depends(get_current_user)):
    global _mock_triggers
    sb = _get_sb()
    if sb:
        result = sb.table("triggers").delete().eq("id", trigger_id).eq("user_id", user_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Trigger not found")
        return

    before = len(_mock_triggers)
    _mock_triggers = [t for t in _mock_triggers
                      if not (t["id"] == trigger_id and t["user_id"] == user_id)]
    if len(_mock_triggers) == before:
        raise HTTPException(status_code=404, detail="Trigger not found")


@router.put("/triggers/{trigger_id}")
async def update_trigger(
    trigger_id: str,
    body: UpdateTriggerRequest,
    user_id: str = Depends(get_current_user),
):
    if body.condition is not None and body.condition not in ("above", "below"):
        raise HTTPException(status_code=400, detail="condition must be 'above' or 'below'")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    sb = _get_sb()
    if sb:
        result = (
            sb.table("triggers")
            .update(updates)
            .eq("id", trigger_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Trigger not found")
        return result.data[0]

    for t in _mock_triggers:
        if t["id"] == trigger_id and t["user_id"] == user_id:
            t.update(updates)
            return t
    raise HTTPException(status_code=404, detail="Trigger not found")
