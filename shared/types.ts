export interface StockData {
  ticker: string;
  price: number;
  timestamp: string; // ISO 8601
  change_pct: number;
}

export interface UserNote {
  id: string;
  ticker: string;
  content: string; // plaintext — never stored encrypted; only in memory
  created_at: string;
}

export interface PriceTrigger {
  id: string;
  ticker: string;
  target_price: number;
  condition: "above" | "below";
  is_active: boolean;
  auto_disarm: boolean;       // true (default): deactivates after firing; user must re-arm
  cooldown_hours: number;     // only applies when auto_disarm is false; default 4
  last_triggered_at: string | null;
}

export interface InsightEmail {
  trigger_id: string;
  ticker: string;
  triggered_price: number;
  summary: string;
  sent_at: string;
}
