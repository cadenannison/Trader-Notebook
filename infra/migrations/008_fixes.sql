-- tradrNotebook migration 008 — bug-hunt fixes
-- Run in: Supabase dashboard → SQL Editor → New query
-- Depends on: 001-007

-- ── system_config: was missing RLS entirely — any anon/authenticated client
-- could read or write maintenance_mode directly via the Supabase client. This
-- table is only ever touched by the worker's service-role client (which
-- bypasses RLS), so client roles get no access at all.
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- ── triggers.condition: was NOT NULL, but pct_move and earnings_warning
-- triggers are created with condition=NULL by design (server/app/api/triggers.py).
-- Creating either of those trigger types without an explicit condition hit a
-- NOT NULL violation and 500'd.
ALTER TABLE triggers ALTER COLUMN condition DROP NOT NULL;

-- ── trades: enforce "at most one open trade per watchlist entry" at the DB
-- layer. Without this, a second open trade linked to the same watchlist entry
-- could be created, and closing/deleting one of them would desync the
-- watchlist entry's status out from under the other still-open trade.
CREATE UNIQUE INDEX trades_one_open_per_watchlist_entry
  ON trades (watchlist_entry_id)
  WHERE status = 'open' AND watchlist_entry_id IS NOT NULL;

-- ── user_id FKs: notes/triggers/watchlist_entries/trades had a bare
-- `user_id UUID NOT NULL` with no FK to auth.users, unlike portfolios/
-- journal_notes (which cascade). Deleting a user account left these rows
-- behind, permanently un-queryable under RLS (auth.uid() can never again
-- equal a deleted user's id).
ALTER TABLE notes
  ADD CONSTRAINT notes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE triggers
  ADD CONSTRAINT triggers_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE watchlist_entries
  ADD CONSTRAINT watchlist_entries_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE trades
  ADD CONSTRAINT trades_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
