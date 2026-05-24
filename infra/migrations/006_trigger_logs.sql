-- Trigger fire history
CREATE TABLE IF NOT EXISTS trigger_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id  UUID        NOT NULL REFERENCES triggers(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL,
  ticker      TEXT        NOT NULL,
  trigger_type TEXT       NOT NULL DEFAULT 'price_level',
  price_at_fire NUMERIC,
  fired_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary     TEXT
);

CREATE INDEX IF NOT EXISTS trigger_logs_trigger_id_idx ON trigger_logs(trigger_id);
CREATE INDEX IF NOT EXISTS trigger_logs_user_id_idx    ON trigger_logs(user_id);

ALTER TABLE trigger_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY trigger_logs_owner ON trigger_logs
  USING (user_id = auth.uid());
