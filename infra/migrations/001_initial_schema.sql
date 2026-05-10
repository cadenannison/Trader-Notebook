-- tradrNotebook initial schema
-- Run this in: Supabase dashboard → SQL Editor → New query

-- ── Notes ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL,
  ticker        TEXT        NOT NULL,
  encrypted_content TEXT    NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes: own rows only" ON notes
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX notes_user_ticker ON notes (user_id, ticker);

-- ── Triggers ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS triggers (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL,
  ticker            TEXT        NOT NULL,
  target_price      NUMERIC     NOT NULL,
  condition         TEXT        NOT NULL CHECK (condition IN ('above', 'below')),
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  auto_disarm       BOOLEAN     NOT NULL DEFAULT TRUE,
  cooldown_hours    INTEGER     NOT NULL DEFAULT 4,
  last_triggered_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "triggers: own rows only" ON triggers
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX triggers_user_ticker ON triggers (user_id, ticker);
CREATE INDEX triggers_active ON triggers (is_active) WHERE is_active = TRUE;

-- ── Agent audit logs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_audit_logs (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  agent_id  TEXT        NOT NULL,
  action    TEXT        NOT NULL,
  metadata  JSONB,
  user_id   UUID
);

ALTER TABLE agent_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs: own rows only" ON agent_audit_logs
  FOR SELECT USING (auth.uid() = user_id);

-- ── System config (kill switch + heartbeat) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS system_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO system_config (key, value)
  VALUES ('maintenance_mode', 'false')
  ON CONFLICT (key) DO NOTHING;
