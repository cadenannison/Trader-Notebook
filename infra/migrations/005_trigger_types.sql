-- ── Expanded trigger types ───────────────────────────────────────────────────
-- Adds support for percentage-move and earnings-warning triggers
-- alongside the existing price_level type.

ALTER TABLE triggers
  ADD COLUMN IF NOT EXISTS trigger_type TEXT NOT NULL DEFAULT 'price_level'
    CHECK (trigger_type IN ('price_level', 'pct_move', 'earnings_warning')),
  ADD COLUMN IF NOT EXISTS threshold_pct NUMERIC,    -- required for pct_move
  ADD COLUMN IF NOT EXISTS reference_price NUMERIC;  -- baseline price for pct_move

-- target_price can be NULL for pct_move / earnings_warning rows
ALTER TABLE triggers
  ALTER COLUMN target_price DROP NOT NULL;
