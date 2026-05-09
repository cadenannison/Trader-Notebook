from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict


class TriggerCondition(str, Enum):
    above = "above"
    below = "below"


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
    auto_disarm: bool = True      # default: deactivate after firing; user must re-arm
    cooldown_hours: int = 4       # only used when auto_disarm is False
    last_triggered_at: Optional[str] = None


class InsightEmail(BaseModel):
    model_config = ConfigDict(strict=True)
    trigger_id: str
    ticker: str
    triggered_price: float
    summary: str
    sent_at: str
