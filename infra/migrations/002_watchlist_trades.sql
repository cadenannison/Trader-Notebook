-- tradrNotebook migration 002 — watchlist entries + trades
-- Run in: Supabase dashboard → SQL Editor → New query
-- Depends on: 001_initial_schema.sql (notes, triggers tables must exist)

-- ── Enums ─────────────────────────────────────────────────────────────────────
CREATE TYPE idea_source AS ENUM (
  'own_research',
  'tip',
  'news',
  'chart_pattern',
  'earnings_catalyst',
  'gut'
);

CREATE TYPE time_horizon AS ENUM (
  'intraday',
  'swing',
  'position'
);

CREATE TYPE watchlist_status AS ENUM (
  'watching',
  'active_trade',
  'completed',
  'expired'
);

CREATE TYPE confidence_tag AS ENUM (
  'confident',
  'neutral',
  'uncertain',
  'fomo'
);

CREATE TYPE exit_reason AS ENUM (
  'hit_target',
  'hit_stop_loss',
  'manually_stopped_out',
  'thesis_changed',
  'panic_sold',
  'needed_capital'
);

-- ── Watchlist Entries ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watchlist_entries (
  id            UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID             NOT NULL,
  ticker        TEXT             NOT NULL,
  reasoning     TEXT             NOT NULL,
  idea_source   idea_source      NOT NULL DEFAULT 'own_research',
  time_horizon  time_horizon     NOT NULL DEFAULT 'swing',
  entry_price   NUMERIC,
  target_price  NUMERIC,
  stop_price    NUMERIC,
  status        watchlist_status NOT NULL DEFAULT 'watching',
  created_at    TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

ALTER TABLE watchlist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "watchlist: own rows only" ON watchlist_entries
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX watchlist_user_ticker ON watchlist_entries (user_id, ticker);
CREATE INDEX watchlist_user_status  ON watchlist_entries (user_id, status);

-- Keep updated_at current automatically
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER watchlist_entries_updated_at
  BEFORE UPDATE ON watchlist_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Link existing triggers to watchlist entries (nullable — backward-compatible)
ALTER TABLE triggers
  ADD COLUMN IF NOT EXISTS watchlist_entry_id UUID
  REFERENCES watchlist_entries(id) ON DELETE SET NULL;

-- ── Trades ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
  id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID           NOT NULL,
  watchlist_entry_id   UUID           REFERENCES watchlist_entries(id) ON DELETE SET NULL,
  ticker               TEXT           NOT NULL,
  entry_price          NUMERIC        NOT NULL,
  exit_price           NUMERIC,
  cost_basis           NUMERIC,
  shares               NUMERIC,
  time_horizon         time_horizon   NOT NULL DEFAULT 'swing',
  confidence_tag       confidence_tag NOT NULL DEFAULT 'neutral',
  exit_reason          exit_reason,
  return_pct           NUMERIC,
  status               TEXT           NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'closed')),
  pre_trade_notes      TEXT,
  logged_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  closed_at            TIMESTAMPTZ
);

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trades: own rows only" ON trades
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX trades_user        ON trades (user_id);
CREATE INDEX trades_user_ticker ON trades (user_id, ticker);
CREATE INDEX trades_user_status ON trades (user_id, status);
CREATE INDEX trades_watchlist   ON trades (watchlist_entry_id);
