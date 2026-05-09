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

export interface Trade {
  id: string;
  alert_id?: string;
  ticker: string;
  entry_price: number;
  exit_price?: number;
  return_pct?: number;
  note: string;
  logged_at: string;
  status: "open" | "closed";
}

export interface NewsArticle {
  ticker: string;
  headline: string;
  summary: string;
  url: string;
  source: string;
  published_at: string;
  sentiment: "bullish" | "bearish" | "neutral";
}

export interface InsightEmail {
  trigger_id: string;
  ticker: string;
  triggered_price: number;
  summary: string;
  sent_at: string;
}
