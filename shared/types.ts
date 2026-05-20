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
  auto_disarm: boolean;
  cooldown_hours: number;
  last_triggered_at: string | null;
  watchlist_entry_id: string | null;
}

// ── Watchlist ─────────────────────────────────────────────────────────────────

export type IdeaSource =
  | "own_research"
  | "tip"
  | "news"
  | "chart_pattern"
  | "earnings_catalyst"
  | "gut";

export type TimeHorizon = "intraday" | "swing" | "position";

export type WatchlistStatus =
  | "watching"
  | "active_trade"
  | "completed"
  | "expired";

export interface WatchlistEntry {
  id: string;
  ticker: string;
  reasoning: string;
  idea_source: IdeaSource;
  time_horizon: TimeHorizon;
  entry_price: number | null;
  target_price: number | null;
  stop_price: number | null;
  status: WatchlistStatus;
  created_at: string;
  updated_at: string;
}

// ── Trades ────────────────────────────────────────────────────────────────────

export type ConfidenceTag = "confident" | "neutral" | "uncertain" | "fomo";

export type ExitReason =
  | "hit_target"
  | "hit_stop_loss"
  | "manually_stopped_out"
  | "thesis_changed"
  | "panic_sold"
  | "needed_capital";

export interface Trade {
  id: string;
  watchlist_entry_id: string | null;
  ticker: string;
  entry_price: number;
  exit_price: number | null;
  cost_basis: number | null;
  shares: number | null;
  time_horizon: TimeHorizon;
  confidence_tag: ConfidenceTag;
  exit_reason: ExitReason | null;
  return_pct: number | null;
  status: "open" | "closed";
  pre_trade_notes: string | null;
  logged_at: string;
  closed_at: string | null;
}

// ── News ──────────────────────────────────────────────────────────────────────

export interface NewsArticle {
  ticker: string;
  headline: string;
  summary: string;
  url: string;
  source: string;
  published_at: string;
  sentiment: "bullish" | "bearish" | "neutral";
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export interface InsightEmail {
  trigger_id: string;
  ticker: string;
  triggered_price: number;
  summary: string;
  sent_at: string;
}
