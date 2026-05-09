import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.middleware.auth import get_current_user

router = APIRouter()

# In-memory store for mock mode. TODO: replace with Supabase client.
_mock_triggers: list[dict] = [
    {
        "id": "trigger-1",
        "user_id": "mock-user-id-dev",
        "ticker": "NVDA",
        "target_price": 900.00,
        "condition": "above",
        "is_active": True,
        "auto_disarm": True,
        "cooldown_hours": 4,
        "last_triggered_at": None,
        "created_at": "2026-04-25T08:00:00Z",
    },
    {
        "id": "trigger-2",
        "user_id": "mock-user-id-dev",
        "ticker": "NVDA",
        "target_price": 800.00,
        "condition": "below",
        "is_active": False,
        "auto_disarm": True,
        "cooldown_hours": 4,
        "last_triggered_at": "2026-04-28T11:00:00Z",
        "created_at": "2026-04-20T12:00:00Z",
    },
    {
        "id": "trigger-3",
        "user_id": "mock-user-id-dev",
        "ticker": "VGT",
        "target_price": 450.00,
        "condition": "above",
        "is_active": True,
        "auto_disarm": False,
        "cooldown_hours": 8,
        "last_triggered_at": None,
        "created_at": "2026-04-22T09:30:00Z",
    },
]


class CreateTriggerRequest(BaseModel):
    ticker: str
    target_price: float
    condition: str
    auto_disarm: bool = True
    cooldown_hours: int = 4


@router.get("/triggers")
async def get_triggers(
    ticker: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    """Return triggers for the current user. TODO: fetch from Supabase."""
    result = [t for t in _mock_triggers if t["user_id"] == user_id]
    if ticker:
        result = [t for t in result if t["ticker"] == ticker.upper()]
    return result


@router.post("/triggers", status_code=201)
async def create_trigger(
    body: CreateTriggerRequest,
    user_id: str = Depends(get_current_user),
):
    """Create a price trigger. TODO: insert into Supabase."""
    if body.condition not in ("above", "below"):
        raise HTTPException(status_code=400, detail="condition must be 'above' or 'below'")
    trigger = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "ticker": body.ticker.upper(),
        "target_price": body.target_price,
        "condition": body.condition,
        "is_active": True,
        "auto_disarm": body.auto_disarm,
        "cooldown_hours": body.cooldown_hours,
        "last_triggered_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _mock_triggers.append(trigger)
    return trigger


@router.put("/triggers/{trigger_id}/rearm")
async def rearm_trigger(
    trigger_id: str,
    user_id: str = Depends(get_current_user),
):
    """Re-activate a fired trigger. TODO: update in Supabase."""
    for trigger in _mock_triggers:
        if trigger["id"] == trigger_id and trigger["user_id"] == user_id:
            trigger["is_active"] = True
            trigger["last_triggered_at"] = None
            return trigger
    raise HTTPException(status_code=404, detail="Trigger not found")


@router.delete("/triggers/{trigger_id}", status_code=204)
async def delete_trigger(
    trigger_id: str,
    user_id: str = Depends(get_current_user),
):
    """Delete a trigger. TODO: delete from Supabase."""
    global _mock_triggers
    before = len(_mock_triggers)
    _mock_triggers = [
        t for t in _mock_triggers
        if not (t["id"] == trigger_id and t["user_id"] == user_id)
    ]
    if len(_mock_triggers) == before:
        raise HTTPException(status_code=404, detail="Trigger not found")
