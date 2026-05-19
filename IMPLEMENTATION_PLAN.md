# TradrNotebook.AI — Implementation Plan

> Agent handoff document. Describes exactly what is built, what is broken, and what to build next in priority order.
> Last updated: 2026-05-19

---

## Quick Reference: What This App Does

TradrNotebook.AI is an AI-powered trading journal. The core loop:

1. User logs a stock idea in plain language → AI structures it into a **Watchlist Entry**
2. User sets price conditions → **Triggers** monitor 24/7 via cron
3. Trigger fires → Email alert with original thesis + AI insight
4. User executes the trade → **Trade** is logged (entry, cost basis, confidence, time horizon)
5. Trade closes → Exit reason logged (hit target, panic sold, etc.)
6. **Pattern Engine** analyzes all trades to surface behavioral coaching insights

The product spec lives in `TradrNotebook_AI_Internal.pdf`. The old progress tracker is `STATUS.md`.

---

## Tech Stack (all spec-compliant, do not change)

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React 18, Tailwind CSS, TanStack Query, Zustand |
| AI | Google Gemini (direct SDK via httpx — not pydantic-ai) |
| Database | Supabase (Postgres + Auth + RLS) |
| Backend | FastAPI + Pydantic v2, Python 3.12 |
| Stock data | Polygon.io (prices) + Finnhub (news) |
| Email | Resend |
| Worker | Python script, GitHub Actions cron (every 15 min) |
| CI | GitHub Actions — ruff, bandit, pip-audit, pytest, vitest, gitleaks |

---

## What Is Fully Built and Working

These are solid. Do not refactor them without a specific reason.

### Infrastructure
- Monorepo: `client/`, `server/`, `worker/`, `shared/`, `infra/`
- Pre-commit hooks: gitleaks, detect-secrets, ruff, prettier
- CI pipeline: `/.github/workflows/ci.yml` — lint, bandit, pip-audit, 70 tests, type-check
- Cron worker pipeline: `infra/.github/workflows/cron-triggers.yml` — every 15 min

### Backend (`server/`)
- Auth middleware: `server/app/middleware/auth.py` — Supabase JWT validation, dev fallback
- Encryption: `server/app/crypto/keys.py` — AES-256-GCM, HKDF-SHA256 per-user key derivation
- Rate limiting: slowapi on all endpoints
- CORS: locked to `CLIENT_URL`
- `GET /api/health` — service config status
- `GET /api/stock/price` — Polygon.io proxy with mock fallback
- `GET /api/stock/validate` — ticker validation
- `POST /api/notes`, `GET /api/notes` — encrypted notes CRUD
- `GET/POST/PUT/DELETE /api/triggers` — full CRUD + rearm
- `POST /api/chat` — Gemini AI, returns `add_alert` or `show_view` actions
- `GET /api/news` — Finnhub proxy, last 7 days, filtered by tickers param

### Worker (`worker/trigger_worker.py`)
- Market hours check (NYSE 9:30–16:00 ET)
- Kill switch via `system_config` table
- Fetches active triggers from Supabase
- Batch price fetch from Polygon.io
- Gemini insight generation per trigger (uses notes + news context)
- Email via Resend
- Writes `agent_audit_logs`
- Auto-disarm + cooldown logic

### Frontend (`client/`)
- `/` — Chat interface, Gemini-backed, persistent history (localStorage via Zustand)
- `/alerts` — Alerts dashboard, grouped by ticker, proximity bars, signal badges
- `/notebook` — Journal tabs: active alerts / triggered / trade history (mock data)
- `/ticker/[symbol]` — Per-ticker: notes form, trigger form, price, fully wired with hooks
- `/news` — Page exists, backend wired in hook, **UI is empty stub**
- `/stats` — Page exists, **UI uses mock data, no real aggregation**
- `/settings` — Page exists, **export and delete buttons are alert() stubs**
- Auth: Supabase client in `client/src/lib/supabase.ts`, JWT injected via `client/src/lib/api.ts`

### Database (`infra/migrations/001_initial_schema.sql`)
Tables: `notes`, `triggers`, `agent_audit_logs`, `system_config`
All have RLS policies. Migration file is written but **not confirmed applied to Supabase** (see Step 0).

---

## Known Blockers (Environment / Ops)

These are not code problems. Fix them to unblock the MVP email flow.

| # | Blocker | Fix |
|---|---|---|
| B1 | `RESEND_API_KEY` is empty in `server/.env` | Add real key from resend.com; also add to GitHub Actions secrets |
| B2 | `CRON_SECRET` is empty in `server/.env` | Generate a random string; add to `server/.env` + GitHub Actions secrets |
| B3 | DB migration not confirmed applied | Open Supabase dashboard → SQL Editor → paste and run `infra/migrations/001_initial_schema.sql` |
| B4 | `deploy.yml` does not exist | Create `infra/.github/workflows/deploy.yml` with Render deploy hook |

---

## The Critical Architectural Gap

**The entire back half of the product (Steps 4–8 of the core flow) is blocked by two missing database tables.**

The current schema has `notes` (free-text ideas) and `triggers` (price alerts) but they are unlinked, and there is no `watchlist_entries` or `trades` table. The spec's product model is:

```
watchlist_entry (idea + metadata)
    └── triggers (conditions on that entry)
    └── trades (executions from that entry)
              └── exit_reason, confidence_tag
              └── pattern_engine input
```

The current model is:

```
notes (isolated free text)          triggers (isolated price alerts)
```

Everything in the ordered steps below builds on fixing this. **Start with Step 1.**

---

## Implementation Steps — Phase 1

Complete these in order. Each step's output is a dependency of the next.

---

### Step 0 — Unblock MVP Email Flow (30 min, ops work)

Before writing any code, fix the environment blockers so the existing worker actually sends emails.

1. Add `RESEND_API_KEY` to `server/.env` and to the GitHub Actions repo secrets.
2. Add `CRON_SECRET` to `server/.env` and GitHub Actions secrets.
3. Apply `infra/migrations/001_initial_schema.sql` to Supabase via SQL Editor.
4. Create `infra/.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy-server:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Render deploy
        run: curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK_URL }}"
```

**Verify**: Manually trigger `cron-triggers.yml` via GitHub Actions → workflow dispatch. Confirm an email arrives.

---

### Step 1 — DB Migration: Add Watchlist Entries + Trades Tables

**File to create**: `infra/migrations/002_watchlist_trades.sql`

```sql
-- ── Watchlist Entries ─────────────────────────────────────────────────────────
CREATE TYPE idea_source AS ENUM (
  'own_research', 'tip', 'news', 'chart_pattern', 'earnings_catalyst', 'gut'
);

CREATE TYPE time_horizon AS ENUM ('intraday', 'swing', 'position');

CREATE TYPE watchlist_status AS ENUM (
  'watching', 'active_trade', 'completed', 'expired'
);

CREATE TABLE IF NOT EXISTS watchlist_entries (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL,
  ticker        TEXT          NOT NULL,
  reasoning     TEXT          NOT NULL,           -- the "why" — plaintext (encrypted at rest via app layer if needed)
  idea_source   idea_source   NOT NULL DEFAULT 'own_research',
  time_horizon  time_horizon  NOT NULL DEFAULT 'swing',
  entry_price   NUMERIC,                          -- planned entry level
  target_price  NUMERIC,                          -- profit target
  stop_price    NUMERIC,                          -- stop loss level
  status        watchlist_status NOT NULL DEFAULT 'watching',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE watchlist_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watchlist: own rows only" ON watchlist_entries
  FOR ALL USING (auth.uid() = user_id);
CREATE INDEX watchlist_user_ticker ON watchlist_entries (user_id, ticker);
CREATE INDEX watchlist_user_status ON watchlist_entries (user_id, status);

-- ── Link triggers to watchlist entries (nullable FK — backward-compatible) ────
ALTER TABLE triggers
  ADD COLUMN IF NOT EXISTS watchlist_entry_id UUID
  REFERENCES watchlist_entries(id) ON DELETE SET NULL;

-- ── Trades ────────────────────────────────────────────────────────────────────
CREATE TYPE confidence_tag AS ENUM ('confident', 'neutral', 'uncertain', 'fomo');

CREATE TYPE exit_reason AS ENUM (
  'hit_target', 'hit_stop_loss', 'manually_stopped_out',
  'thesis_changed', 'panic_sold', 'needed_capital'
);

CREATE TYPE trade_status AS ENUM ('open', 'closed');

CREATE TABLE IF NOT EXISTS trades (
  id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID           NOT NULL,
  watchlist_entry_id   UUID           REFERENCES watchlist_entries(id) ON DELETE SET NULL,
  ticker               TEXT           NOT NULL,
  entry_price          NUMERIC        NOT NULL,
  exit_price           NUMERIC,
  cost_basis           NUMERIC,                   -- total dollars at risk
  shares               NUMERIC,
  time_horizon         time_horizon   NOT NULL DEFAULT 'swing',
  confidence_tag       confidence_tag NOT NULL DEFAULT 'neutral',
  exit_reason          exit_reason,
  return_pct           NUMERIC,                   -- computed on exit: (exit-entry)/entry*100
  status               trade_status   NOT NULL DEFAULT 'open',
  pre_trade_notes      TEXT,                      -- optional pre-trade checklist notes
  logged_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  closed_at            TIMESTAMPTZ
);

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trades: own rows only" ON trades
  FOR ALL USING (auth.uid() = user_id);
CREATE INDEX trades_user ON trades (user_id);
CREATE INDEX trades_user_ticker ON trades (user_id, ticker);
CREATE INDEX trades_user_status ON trades (user_id, status);
CREATE INDEX trades_watchlist ON trades (watchlist_entry_id);
```

Apply this migration to Supabase via SQL Editor.

---

### Step 2 — Update Shared Types

**File**: `shared/types.ts` — add after the existing `Trade` interface (replace the thin `Trade` with the full version):

```typescript
export type IdeaSource =
  | 'own_research' | 'tip' | 'news'
  | 'chart_pattern' | 'earnings_catalyst' | 'gut';

export type TimeHorizon = 'intraday' | 'swing' | 'position';
export type WatchlistStatus = 'watching' | 'active_trade' | 'completed' | 'expired';
export type ConfidenceTag = 'confident' | 'neutral' | 'uncertain' | 'fomo';
export type ExitReason =
  | 'hit_target' | 'hit_stop_loss' | 'manually_stopped_out'
  | 'thesis_changed' | 'panic_sold' | 'needed_capital';

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
  status: 'open' | 'closed';
  pre_trade_notes: string | null;
  logged_at: string;
  closed_at: string | null;
}
```

**File**: `shared/models.py` — add matching Pydantic models for all new enums and classes:

```python
class IdeaSource(str, Enum):
    own_research = "own_research"
    tip = "tip"
    news = "news"
    chart_pattern = "chart_pattern"
    earnings_catalyst = "earnings_catalyst"
    gut = "gut"

class TimeHorizon(str, Enum):
    intraday = "intraday"
    swing = "swing"
    position = "position"

class WatchlistStatus(str, Enum):
    watching = "watching"
    active_trade = "active_trade"
    completed = "completed"
    expired = "expired"

class ConfidenceTag(str, Enum):
    confident = "confident"
    neutral = "neutral"
    uncertain = "uncertain"
    fomo = "fomo"

class ExitReason(str, Enum):
    hit_target = "hit_target"
    hit_stop_loss = "hit_stop_loss"
    manually_stopped_out = "manually_stopped_out"
    thesis_changed = "thesis_changed"
    panic_sold = "panic_sold"
    needed_capital = "needed_capital"

class WatchlistEntry(BaseModel):
    model_config = ConfigDict(strict=True)
    id: str
    ticker: str
    reasoning: str
    idea_source: IdeaSource
    time_horizon: TimeHorizon
    entry_price: Optional[float] = None
    target_price: Optional[float] = None
    stop_price: Optional[float] = None
    status: WatchlistStatus
    created_at: str
    updated_at: str

class Trade(BaseModel):
    model_config = ConfigDict(strict=True)
    id: str
    watchlist_entry_id: Optional[str] = None
    ticker: str
    entry_price: float
    exit_price: Optional[float] = None
    cost_basis: Optional[float] = None
    shares: Optional[float] = None
    time_horizon: TimeHorizon
    confidence_tag: ConfidenceTag
    exit_reason: Optional[ExitReason] = None
    return_pct: Optional[float] = None
    status: str  # "open" | "closed"
    pre_trade_notes: Optional[str] = None
    logged_at: str
    closed_at: Optional[str] = None
```

---

### Step 3 — Backend: Watchlist API

**File to create**: `server/app/api/watchlist.py`

Endpoints:
- `GET /api/watchlist` — list all entries for current user (optionally `?status=watching`)
- `POST /api/watchlist` — create entry (body: ticker, reasoning, idea_source, time_horizon, entry_price?, target_price?, stop_price?)
- `PUT /api/watchlist/{id}` — update entry (any field including status transition)
- `DELETE /api/watchlist/{id}` — delete entry

Pattern to follow: `server/app/api/notes.py` and `server/app/api/triggers.py`. Use the same auth pattern (`Depends(get_current_user)`), same Supabase client, same mock fallback pattern for dev mode.

Register in `server/app/main.py`:
```python
from app.api import watchlist
app.include_router(watchlist.router, prefix="/api")
```

---

### Step 4 — Backend: Trades API

**File to create**: `server/app/api/trades.py`

Endpoints:
- `GET /api/trades` — list all trades for current user (optionally `?ticker=NVDA&status=open`)
- `POST /api/trades` — log trade entry (body: ticker, entry_price, cost_basis?, shares?, time_horizon, confidence_tag, watchlist_entry_id?, pre_trade_notes?)
- `PUT /api/trades/{id}/close` — log exit (body: exit_price, exit_reason, closed_at?)
  - Compute `return_pct = (exit_price - entry_price) / entry_price * 100` on write
  - Set `status = "closed"`, `closed_at = NOW()`
  - If `watchlist_entry_id` is set and exit_reason is not `needed_capital`, update the linked watchlist entry status to `"completed"`

Register in `server/app/main.py`.

Write tests in `server/tests/test_trades_api.py` following the pattern in `test_triggers_api.py`.

---

### Step 5 — Expand Chat Intent Routing

**File to modify**: `server/app/api/chat.py`

The `ChatAction` model and `_SYSTEM_PROMPT` must be extended to support new intent types. Add to `ChatAction`:

```python
class ChatAction(BaseModel):
    type: str  # add_alert | show_view | log_idea | log_trade | close_trade
    # existing fields...
    # new fields for log_idea:
    reasoning: Optional[str] = None
    idea_source: Optional[str] = None   # own_research|tip|news|chart_pattern|earnings_catalyst|gut
    time_horizon: Optional[str] = None  # intraday|swing|position
    entry_price: Optional[float] = None
    target_price: Optional[float] = None
    stop_price: Optional[float] = None
    # new fields for log_trade:
    confidence_tag: Optional[str] = None  # confident|neutral|uncertain|fomo
    cost_basis: Optional[float] = None
    # new fields for close_trade:
    trade_id: Optional[str] = None
    exit_reason: Optional[str] = None
```

Extend `_SYSTEM_PROMPT` to document all action types and examples for:
- `log_idea`: "I like NVDA for an earnings breakout, been watching it for 2 weeks"
- `log_trade`: "I bought 50 shares of NVDA at $890, feeling confident"
- `close_trade`: "I sold my NVDA position, hit my target"
- `query_watchlist`: "show me what I'm watching"
- `query_history`: "how have my swing trades performed?"

In the route handler, after parsing the action, dispatch it:
- `log_idea` → call `POST /api/watchlist` internally (or return action for frontend to dispatch)
- `log_trade` → return action for frontend to call `POST /api/trades`
- `close_trade` → return action for frontend to call `PUT /api/trades/{id}/close`

---

### Step 6 — Frontend: Wire Chat Actions for Watchlist + Trades

**File to modify**: `client/src/app/page.tsx`

The chat page already handles `add_alert` and `show_view` actions. Add handlers for:
- `log_idea` → call `POST /api/watchlist` via a new `useCreateWatchlistEntry` mutation
- `log_trade` → open a confirmation modal showing parsed fields, then call `POST /api/trades`
- `close_trade` → show parsed exit fields, call `PUT /api/trades/{id}/close`

**New hooks to create**:
- `client/src/hooks/useWatchlist.ts` — `useWatchlistEntries()`, `useCreateWatchlistEntry()`, `useUpdateWatchlistEntry()`
- `client/src/hooks/useTrades.ts` — `useTrades()`, `useCreateTrade()`, `useCloseTrade()`

Pattern: follow `client/src/hooks/useTriggers.ts` exactly.

---

### Step 7 — Frontend: Wire Notebook Page to Real Data

**File to modify**: `client/src/app/notebook/page.tsx`

Currently renders `MOCK_TRADES`. Replace with:
- Active trades tab → `useTrades({ status: 'open' })`
- Trade history tab → `useTrades({ status: 'closed' })`
- Stats cards → compute from real trade data (total open, total closed, win rate)

Each trade card should show: ticker, entry price, current price (from `useStockPrice`), P&L %, confidence tag badge, time horizon badge.

---

### Step 8 — Frontend: Complete News Page

**File to modify**: `client/src/app/news/page.tsx`

The backend endpoint `GET /api/news?tickers=NVDA,AAPL` is fully working. The frontend hook `useNews` exists at `client/src/hooks/useNews.ts`.

Steps:
1. In the news page, call `useWatchlistEntries()` to get the user's active tickers.
2. Pass those tickers to `useNews(tickers)`.
3. Render each article as a card: headline, source, published date, sentiment badge (bullish/bearish/neutral with color).
4. Group by ticker or sort by published_at descending.

**Also fix backend**: `server/app/api/news.py` has a TODO for sentiment classification. Add a simple Gemini call to classify each headline (bullish/bearish/neutral) — batch all headlines in a single prompt call to avoid rate limit overhead. Model: `gemini-2.0-flash-lite` for cost efficiency.

---

### Step 9 — Expand Alert Trigger Types

**File to modify**: `infra/migrations/` — add `003_trigger_types.sql`:

```sql
ALTER TABLE triggers
  ADD COLUMN IF NOT EXISTS trigger_type TEXT NOT NULL DEFAULT 'price_level'
    CHECK (trigger_type IN ('price_level', 'pct_move', 'earnings_warning')),
  ADD COLUMN IF NOT EXISTS threshold_pct NUMERIC,     -- used by pct_move
  ADD COLUMN IF NOT EXISTS reference_price NUMERIC;   -- open price for pct_move reference
```

**File to modify**: `server/app/api/triggers.py` — accept new fields in create body.

**File to modify**: `worker/trigger_worker.py` — update `_is_trigger_hit()` to handle:
- `pct_move`: `abs((current_price - reference_price) / reference_price * 100) >= threshold_pct`
- `earnings_warning`: integrate Finnhub earnings calendar; check if earnings is within 1 calendar day

Update the chat system prompt to parse "alert me if NVDA moves 5%" → `pct_move` trigger type.

---

### Step 10 — Daily Briefing

**File to create**: `server/app/api/briefing.py`

`GET /api/briefing` — generates the morning briefing for the current user:

1. Query `watchlist_entries` where `status IN ('watching', 'active_trade')`.
2. Fetch current prices for all tickers.
3. Identify "near-trigger" entries: price within 3% of `target_price` or `stop_price`.
4. Call Finnhub earnings calendar for today and tomorrow.
5. For open trades, identify which moved >2% overnight.
6. Call Gemini with all this context to generate one personalized coaching insight based on recent trade history.
7. Return structured JSON:

```json
{
  "near_triggers": [...],
  "earnings_today": [...],
  "overnight_movers": [...],
  "coaching_insight": "Your last 3 swing trades were all tip-sourced. Win rate on those is 22%."
}
```

**File to create**: `infra/.github/workflows/daily-briefing.yml` — runs at `0 13 * * 1-5` (8 AM ET):

```yaml
name: Daily Briefing
on:
  schedule:
    - cron: '0 13 * * 1-5'
  workflow_dispatch:
jobs:
  briefing:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run briefing worker
        run: python worker/daily_briefing.py
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          # ... other secrets
```

**File to create**: `worker/daily_briefing.py` — calls `GET /api/briefing` for each active user and sends the email via Resend.

Register the API route in `server/app/main.py`.

---

### Step 11 — Basic Pattern Engine (Stats Page)

**File to create**: `server/app/api/insights.py`

`GET /api/insights` — runs SQL aggregations over the `trades` table for the current user:

```sql
-- Win rate by idea_source (requires joining to watchlist_entries)
SELECT
  we.idea_source,
  COUNT(*) AS total,
  SUM(CASE WHEN t.return_pct > 0 THEN 1 ELSE 0 END) AS wins,
  AVG(t.return_pct) AS avg_return
FROM trades t
JOIN watchlist_entries we ON t.watchlist_entry_id = we.id
WHERE t.user_id = $1 AND t.status = 'closed'
GROUP BY we.idea_source;

-- Win rate by confidence_tag
SELECT confidence_tag, COUNT(*), AVG(return_pct)
FROM trades WHERE user_id = $1 AND status = 'closed'
GROUP BY confidence_tag;

-- Exit reason breakdown
SELECT exit_reason, COUNT(*), AVG(return_pct)
FROM trades WHERE user_id = $1 AND status = 'closed'
GROUP BY exit_reason;

-- Stop override behavior: manually_stopped_out vs hit_stop_loss
-- Time horizon performance
```

Pass aggregation results to Gemini to generate 3–5 plain-language coaching insights.

Return:
```json
{
  "summary": { "total_trades": 42, "win_rate": 0.61, "avg_return": 4.2 },
  "by_idea_source": [...],
  "by_confidence_tag": [...],
  "by_exit_reason": [...],
  "coaching_insights": ["Your FOMO trades lose 6.2% on average...", ...]
}
```

**File to modify**: `client/src/app/stats/page.tsx` — replace mock data with `useInsights()` hook. Show coaching insight cards prominently.

---

### Step 12 — Worker Enhancement: Historical Context in Alert Emails

**File to modify**: `worker/trigger_worker.py`

In `run_insight_agent()`, before calling Gemini, also query the `trades` table for closed trades on the same ticker:

```python
similar_trades = await fetch_similar_trades(user_id, ticker)
# Pass to Gemini prompt: "On your last 4 NVDA trades, avg return was +8.3%..."
```

This fulfills the spec requirement: each alert email includes "how similar past setups performed."

---

### Step 13 — Settings Page: Wire Export and Delete

**File to modify**: `server/app/api/user.py`

- `GET /api/user/export`: currently returns raw encrypted notes. Decrypt them using `keys.py` before serializing to JSON.
- `DELETE /api/user/me`: add Supabase Admin API call to delete the auth user after cascading data delete.

**File to modify**: `client/src/app/settings/page.tsx` — replace `alert()` stubs with real API calls.

---

## Implementation Steps — Phase 2

Begin these only after all Phase 1 steps are complete.

---

### P2-Step 1 — Pre-Trade Checklist

When the user initiates `log_trade` via chat or UI, before committing the trade:

1. Display a checklist modal asking:
   - "Does this still match your original thesis?" (Yes / Partially / No)
   - "What is your exit plan?" (text input — pre-fill from watchlist `stop_price` / `target_price` if set)
   - "How are you feeling about this trade?" (maps to `confidence_tag`)

2. Store checklist response in `trades.pre_trade_notes` JSON field.
3. If thesis answer is "No", surface a warning: "You said this no longer matches your thesis. Are you sure?"

---

### P2-Step 2 — Full Pattern Engine

Extend `server/app/api/insights.py` with all 6 spec-defined analysis dimensions:
1. Setup type (from watchlist `idea_source` + reasoning keywords)
2. Idea source (already in P1 basic engine)
3. Time horizon
4. Confidence at entry
5. Stop loss behavior (count `manually_stopped_out`, compare outcomes to `hit_stop_loss`)
6. Exit pattern (did user exit before stated target? compare `exit_price` to watchlist `target_price`)

Add trend analysis: compare last 10 trades vs. first 10 trades to show improvement or regression.

---

### P2-Step 3 — Emotional Tagging & Behavioral Alerts

Add a post-trade behavioral flag in the worker/briefing:

- If user has 3+ consecutive `fomo` or `panic_sold` exits: send a behavioral alert email.
- If user has overridden stop loss >3 times in 30 days: flag in daily briefing.
- These are the "pattern engine honest" moments the spec emphasizes.

---

### P2-Step 4 — Mobile App

- **Stack**: React Native + Expo (spec-mandated)
- **Approach**: Start with Expo Router. Share types from `shared/types.ts`. All data comes from the existing FastAPI backend — no new API work needed.
- **Scope**: Chat interface + Alerts view + Watchlist view. Native push notifications via Expo Push Notifications (replace/supplement email alerts).

---

## Files the Next Agent Must Not Touch

- `server/app/crypto/keys.py` — encryption is correct, do not change key derivation
- `server/app/middleware/auth.py` — auth is working, dev fallback is intentional
- `infra/migrations/001_initial_schema.sql` — do not modify, only add new migration files
- `worker/trigger_worker.py` — only add to it, the core logic is solid
- `.github/workflows/ci.yml` — CI is working, add jobs but don't change existing ones
- `MASTER_KEY` in `.env` — **never regenerate once any notes exist in production**

---

## Definition of Done — Phase 1

Phase 1 is complete when a user can:
1. Open the chat, describe a stock idea in plain language, and have it saved as a structured watchlist entry.
2. Set a price trigger on that idea via chat.
3. Receive an email alert when the trigger fires, including the original thesis and recent news.
4. Log a trade entry from the chat.
5. Log the trade exit with an exit reason from the chat.
6. View the news page filtered to their watched stocks, with sentiment tags.
7. View the stats page with real win rate, average return, and at least one AI coaching insight.
8. Receive a daily morning briefing email with near-trigger setups and one coaching insight.

---

## Definition of Done — Phase 2

Phase 2 is complete when a user can:
1. Complete the pre-trade checklist before logging any trade.
2. View the full pattern engine across all 6 dimensions on the stats page.
3. Receive behavioral alerts when stop-override or panic patterns emerge.
4. Use the mobile app (iOS + Android) to do all of the above.
