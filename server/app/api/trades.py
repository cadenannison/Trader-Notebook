import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.middleware.auth import get_current_user

router = APIRouter()

_mock_trades: list[dict] = []


def _get_sb():
    if not (settings.supabase_url and settings.supabase_service_key):
        return None
    from supabase import create_client

    return create_client(settings.supabase_url, settings.supabase_service_key)


class CreateTradeRequest(BaseModel):
    ticker: str
    entry_price: float
    time_horizon: str = "swing"
    confidence_tag: str = "neutral"
    watchlist_entry_id: Optional[str] = None
    cost_basis: Optional[float] = None
    shares: Optional[float] = None
    pre_trade_notes: Optional[str] = None


class CloseTradeRequest(BaseModel):
    exit_price: float
    exit_reason: str


class UpdateTradeRequest(BaseModel):
    entry_price: Optional[float] = None
    time_horizon: Optional[str] = None
    confidence_tag: Optional[str] = None
    shares: Optional[float] = None
    cost_basis: Optional[float] = None
    pre_trade_notes: Optional[str] = None
    exit_price: Optional[float] = None
    exit_reason: Optional[str] = None


_VALID_CONFIDENCE = {"confident", "neutral", "uncertain", "fomo"}
_VALID_HORIZONS = {"intraday", "swing", "position"}
_VALID_EXIT_REASONS = {
    "hit_target",
    "hit_stop_loss",
    "manually_stopped_out",
    "thesis_changed",
    "panic_sold",
    "needed_capital",
}


@router.get("/trades")
async def get_trades(
    ticker: Optional[str] = None,
    status: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    sb = _get_sb()
    if sb:
        q = sb.table("trades").select("*").eq("user_id", user_id).order("logged_at", desc=True)
        if ticker:
            q = q.eq("ticker", ticker.upper())
        if status:
            q = q.eq("status", status)
        return q.execute().data

    result = [t for t in _mock_trades if t["user_id"] == user_id]
    if ticker:
        result = [t for t in result if t["ticker"] == ticker.upper()]
    if status:
        result = [t for t in result if t["status"] == status]
    return result


@router.post("/trades", status_code=201)
async def create_trade(
    body: CreateTradeRequest,
    user_id: str = Depends(get_current_user),
):
    if body.confidence_tag not in _VALID_CONFIDENCE:
        raise HTTPException(
            status_code=400,
            detail=f"confidence_tag must be one of: {', '.join(sorted(_VALID_CONFIDENCE))}",
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
        "entry_price": body.entry_price,
        "time_horizon": body.time_horizon,
        "confidence_tag": body.confidence_tag,
        "watchlist_entry_id": body.watchlist_entry_id,
        "cost_basis": body.cost_basis,
        "shares": body.shares,
        "pre_trade_notes": body.pre_trade_notes,
        "exit_price": None,
        "exit_reason": None,
        "return_pct": None,
        "status": "open",
        "logged_at": now,
        "closed_at": None,
    }

    sb = _get_sb()
    if sb:
        # Optionally transition linked watchlist entry to active_trade
        if body.watchlist_entry_id:
            sb.table("watchlist_entries").update({"status": "active_trade"}).eq(
                "id", body.watchlist_entry_id
            ).eq("user_id", user_id).execute()
        return sb.table("trades").insert(row).execute().data[0]

    trade = {"id": str(uuid.uuid4()), **row}
    _mock_trades.append(trade)
    return trade


@router.put("/trades/{trade_id}/close")
async def close_trade(
    trade_id: str,
    body: CloseTradeRequest,
    user_id: str = Depends(get_current_user),
):
    if body.exit_reason not in _VALID_EXIT_REASONS:
        raise HTTPException(
            status_code=400,
            detail=f"exit_reason must be one of: {', '.join(sorted(_VALID_EXIT_REASONS))}",
        )

    now = datetime.now(timezone.utc).isoformat()

    sb = _get_sb()
    if sb:
        # Fetch the trade to get entry_price and watchlist_entry_id
        existing = (
            sb.table("trades")
            .select("entry_price, watchlist_entry_id")
            .eq("id", trade_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Trade not found")

        entry_price = existing.data[0]["entry_price"]
        watchlist_entry_id = existing.data[0].get("watchlist_entry_id")
        return_pct = round((body.exit_price - entry_price) / entry_price * 100, 4) if entry_price else 0.0

        updates = {
            "exit_price": body.exit_price,
            "exit_reason": body.exit_reason,
            "return_pct": return_pct,
            "status": "closed",
            "closed_at": now,
        }
        result = (
            sb.table("trades").update(updates).eq("id", trade_id).eq("user_id", user_id).execute()
        )

        # Transition watchlist entry to completed (unless external capital reason)
        if watchlist_entry_id and body.exit_reason != "needed_capital":
            sb.table("watchlist_entries").update({"status": "completed"}).eq(
                "id", watchlist_entry_id
            ).eq("user_id", user_id).execute()

        return result.data[0]

    # Mock path
    for trade in _mock_trades:
        if trade["id"] == trade_id and trade["user_id"] == user_id:
            ep = trade["entry_price"]
            return_pct = round((body.exit_price - ep) / ep * 100, 4) if ep else 0.0
            trade.update(
                {
                    "exit_price": body.exit_price,
                    "exit_reason": body.exit_reason,
                    "return_pct": return_pct,
                    "status": "closed",
                    "closed_at": now,
                }
            )
            return trade
    raise HTTPException(status_code=404, detail="Trade not found")


@router.put("/trades/{trade_id}")
async def update_trade(
    trade_id: str,
    body: UpdateTradeRequest,
    user_id: str = Depends(get_current_user),
):
    if body.confidence_tag is not None and body.confidence_tag not in _VALID_CONFIDENCE:
        raise HTTPException(
            status_code=400,
            detail=f"confidence_tag must be one of: {', '.join(sorted(_VALID_CONFIDENCE))}",
        )
    if body.time_horizon is not None and body.time_horizon not in _VALID_HORIZONS:
        raise HTTPException(
            status_code=400,
            detail=f"time_horizon must be one of: {', '.join(sorted(_VALID_HORIZONS))}",
        )
    if body.exit_reason is not None and body.exit_reason not in _VALID_EXIT_REASONS:
        raise HTTPException(
            status_code=400,
            detail=f"exit_reason must be one of: {', '.join(sorted(_VALID_EXIT_REASONS))}",
        )

    updates: dict = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    sb = _get_sb()
    if sb:
        existing = (
            sb.table("trades")
            .select("entry_price, exit_price, status")
            .eq("id", trade_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Trade not found")

        row = existing.data[0]
        if row["status"] == "closed":
            new_entry = updates.get("entry_price", row["entry_price"])
            new_exit = updates.get("exit_price", row["exit_price"])
            if new_exit is not None and new_entry:
                updates["return_pct"] = round((new_exit - new_entry) / new_entry * 100, 4)

        result = (
            sb.table("trades").update(updates).eq("id", trade_id).eq("user_id", user_id).execute()
        )
        return result.data[0]

    for trade in _mock_trades:
        if trade["id"] == trade_id and trade["user_id"] == user_id:
            trade.update(updates)
            ep = trade.get("entry_price")
            if trade["status"] == "closed" and trade.get("exit_price") and ep:
                trade["return_pct"] = round((trade["exit_price"] - ep) / ep * 100, 4)
            return trade
    raise HTTPException(status_code=404, detail="Trade not found")


@router.delete("/trades/{trade_id}", status_code=204)
async def delete_trade(trade_id: str, user_id: str = Depends(get_current_user)):
    global _mock_trades
    sb = _get_sb()
    if sb:
        result = sb.table("trades").delete().eq("id", trade_id).eq("user_id", user_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Trade not found")
        return

    before = len(_mock_trades)
    _mock_trades = [
        t for t in _mock_trades if not (t["id"] == trade_id and t["user_id"] == user_id)
    ]
    if len(_mock_trades) == before:
        raise HTTPException(status_code=404, detail="Trade not found")
