from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict


class TriggerCondition(str, Enum):
    above = "above"
    below = "below"


class IdeaSource(str, Enum):
    own_research = "own_research"
    tip = "tip"
    news = "news"
    chart_pattern = "chart_pattern"
    earnings_catalyst = "earnings_catalyst"
    gut = "gut"


class TimeHorizon(str, Enum):
    intraday = "intraday"
    swing = "swing"
    position = "position"


class WatchlistStatus(str, Enum):
    watching = "watching"
    active_trade = "active_trade"
    completed = "completed"
    expired = "expired"


class ConfidenceTag(str, Enum):
    confident = "confident"
    neutral = "neutral"
    uncertain = "uncertain"
    fomo = "fomo"


class ExitReason(str, Enum):
    hit_target = "hit_target"
    hit_stop_loss = "hit_stop_loss"
    manually_stopped_out = "manually_stopped_out"
    thesis_changed = "thesis_changed"
    panic_sold = "panic_sold"
    needed_capital = "needed_capital"


class StockData(BaseModel):
    model_config = ConfigDict(strict=True)
    ticker: str
    price: float
    timestamp: str
    change_pct: float


class UserNote(BaseModel):
    model_config = ConfigDict(strict=True)
    id: str
    ticker: str
    content: str  # plaintext — decrypted in memory only, never stored
    created_at: str


class PriceTrigger(BaseModel):
    model_config = ConfigDict(strict=True)
    id: str
    ticker: str
    target_price: float
    condition: TriggerCondition
    is_active: bool
    auto_disarm: bool = True
    cooldown_hours: int = 4
    last_triggered_at: Optional[str] = None
    watchlist_entry_id: Optional[str] = None


class WatchlistEntry(BaseModel):
    model_config = ConfigDict(strict=True)
    id: str
    ticker: str
    reasoning: str
    idea_source: IdeaSource
    time_horizon: TimeHorizon
    entry_price: Optional[float] = None
    target_price: Optional[float] = None
    stop_price: Optional[float] = None
    status: WatchlistStatus
    created_at: str
    updated_at: str


class Trade(BaseModel):
    model_config = ConfigDict(strict=True)
    id: str
    watchlist_entry_id: Optional[str] = None
    ticker: str
    entry_price: float
    exit_price: Optional[float] = None
    cost_basis: Optional[float] = None
    shares: Optional[float] = None
    time_horizon: TimeHorizon
    confidence_tag: ConfidenceTag
    exit_reason: Optional[ExitReason] = None
    return_pct: Optional[float] = None
    status: str  # "open" | "closed"
    pre_trade_notes: Optional[str] = None
    logged_at: str
    closed_at: Optional[str] = None


class InsightEmail(BaseModel):
    model_config = ConfigDict(strict=True)
    trigger_id: str
    ticker: str
    triggered_price: float
    summary: str
    sent_at: str
