import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.middleware.auth import get_current_user

router = APIRouter()

_mock_portfolios: list[dict] = []


def _get_sb():
    if not (settings.supabase_url and settings.supabase_service_key):
        return None
    from supabase import create_client

    return create_client(settings.supabase_url, settings.supabase_service_key)


class CreatePortfolioRequest(BaseModel):
    name: str
    thesis: Optional[str] = None


class UpdatePortfolioRequest(BaseModel):
    name: Optional[str] = None
    thesis: Optional[str] = None


@router.get("/portfolios")
async def get_portfolios(user_id: str = Depends(get_current_user)):
    sb = _get_sb()
    if sb:
        return (
            sb.table("portfolios")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
            .data
        )
    return [p for p in _mock_portfolios if p["user_id"] == user_id]


@router.post("/portfolios", status_code=201)
async def create_portfolio(body: CreatePortfolioRequest, user_id: str = Depends(get_current_user)):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="name is required")
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "user_id": user_id,
        "name": body.name.strip(),
        "thesis": body.thesis,
        "created_at": now,
        "updated_at": now,
    }
    sb = _get_sb()
    if sb:
        return sb.table("portfolios").insert(row).execute().data[0]
    portfolio = {"id": str(uuid.uuid4()), **row}
    _mock_portfolios.append(portfolio)
    return portfolio


@router.put("/portfolios/{portfolio_id}")
async def update_portfolio(
    portfolio_id: str,
    body: UpdatePortfolioRequest,
    user_id: str = Depends(get_current_user),
):
    fields_set = body.model_fields_set
    updates: dict = {}
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(status_code=400, detail="name cannot be empty")
        updates["name"] = body.name.strip()
    if "thesis" in fields_set:
        # Client explicitly sent thesis (possibly ""/null to clear it) — don't
        # drop that just because it's falsy, only skip when the field was
        # never mentioned at all.
        updates["thesis"] = (body.thesis.strip() or None) if body.thesis else None
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    sb = _get_sb()
    if sb:
        result = (
            sb.table("portfolios")
            .update(updates)
            .eq("id", portfolio_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        return result.data[0]

    for p in _mock_portfolios:
        if p["id"] == portfolio_id and p["user_id"] == user_id:
            p.update(updates)
            return p
    raise HTTPException(status_code=404, detail="Portfolio not found")


@router.delete("/portfolios/{portfolio_id}", status_code=204)
async def delete_portfolio(portfolio_id: str, user_id: str = Depends(get_current_user)):
    global _mock_portfolios
    sb = _get_sb()
    if sb:
        result = (
            sb.table("portfolios").delete().eq("id", portfolio_id).eq("user_id", user_id).execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        return

    before = len(_mock_portfolios)
    _mock_portfolios = [
        p for p in _mock_portfolios if not (p["id"] == portfolio_id and p["user_id"] == user_id)
    ]
    if len(_mock_portfolios) == before:
        raise HTTPException(status_code=404, detail="Portfolio not found")
