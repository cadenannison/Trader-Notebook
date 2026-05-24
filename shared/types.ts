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

export type TriggerType = "price_level" | "pct_move" | "earnings_warning";

export interface PriceTrigger {
  id: string;
  ticker: string;
  target_price: number | null;
  condition: "above" | "below" | null;
  trigger_type: TriggerType;
  threshold_pct: number | null;
  reference_price: number | null;
  is_active: boolean;
  auto_disarm: boolean;
  cooldown_hours: number;
  last_triggered_at: string | null;
  watchlist_entry_id: string | null;
  notes: string | null;
  portfolio_id: string | null;
}

export interface Portfolio {
  id: string;
  name: string;
  thesis: string | null;
  created_at: string;
  updated_at: string;
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

// ── Journal notes ─────────────────────────────────────────────────────────────

export interface JournalNote {
  id: string;
  title: string | null;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ── Trigger logs ─────────────────────────────────────────────────────────────

export interface TriggerLog {
  id: string;
  trigger_id: string;
  user_id: string;
  ticker: string;
  trigger_type: string;
  price_at_fire: number | null;
  fired_at: string;
  summary: string | null;
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export interface InsightEmail {
  trigger_id: string;
  ticker: string;
  triggered_price: number;
  summary: string;
  sent_at: string;
}
