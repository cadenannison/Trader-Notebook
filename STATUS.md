# Trader Notebook — Plan vs. Reality

> Generated 2026-05-10. Tracks what the GAMEPLAN.md called for vs. what's actually built.

---

## Inconsistencies (plan said X, code does Y)

| # | Plan | Reality |
|---|---|---|
| 1 | "Gemini 2.0 Flash **via Pydantic AI**" | Code uses direct Gemini SDK — `pydantic-ai` is not installed or used anywhere |
| 2 | `agent_audit_logs` table defined in Phase 2 schema | Missing from `infra/migrations/001_initial_schema.sql` |
| 3 | `system_config` table defined in Phase 2 schema | Missing from `infra/migrations/001_initial_schema.sql` |
| 4 | `worker/requirements.txt` listed in monorepo layout | File does not exist — `cron-triggers.yml` will fail at `pip install` step |
| 5 | Worker wires Supabase + Polygon + Resend end-to-end | All 7 worker functions are stubbed (`print()` / mock data / hardcoded false) |
| 6 | Resend email on trigger fire (MVP scope) | `send_email()` is `print()` — RESEND_API_KEY not set |
| 7 | CRON_SECRET for authenticating cron job | Not set in `server/.env` or GitHub Actions secrets |
| 8 | `client/.env.local` with Supabase public keys | File does not exist |
| 9 | Render deploy hook in `deploy.yml` | Placeholder comment only — no real URL wired |

---

## Phase 1 — Governance & Scaffold

- [x] Monorepo structure (`client/`, `server/`, `worker/`, `shared/`, `infra/`)
- [x] Pre-commit hooks (`.pre-commit-config.yaml`)
- [x] Ruff linting configured
- [x] Prettier + ESLint on frontend
- [x] Strict TypeScript (`tsconfig.json`)
- [x] Strict Pydantic (`ConfigDict(strict=True)` in models)
- [x] `shared/types.ts` and `shared/models.py` (single source of truth for shapes)
- [x] MASTER_KEY generated and stored
- [x] `.env.example` committed with all required keys documented
- [x] `Makefile` with `dev`, `test`, `worker` targets

---

## Phase 2 — Secure Data Foundation

- [x] Supabase Auth with RLS enabled
- [x] `notes` table schema with RLS policy
- [x] `triggers` table schema with RLS policy
- [x] AES-256-GCM per-user encryption (`server/app/crypto/keys.py`)
- [ ] `agent_audit_logs` table — **missing from migration** (inconsistency #2)
- [ ] `system_config` table for kill switch — **missing from migration** (inconsistency #3)
- [ ] Apply `infra/migrations/001_initial_schema.sql` to Supabase — **tables not yet created in DB**
- [ ] Create `client/.env.local` — **missing** (inconsistency #8)

---

## Phase 3 — API & Service Mesh

- [x] CORS middleware locked to `CLIENT_URL`
- [x] Supabase JWT validation middleware (`server/app/middleware/auth.py`)
- [x] Rate limiting via `slowapi` on all endpoints
- [x] `GET /api/stock/price` — Polygon.io proxy with mocks
- [x] `GET /api/stock/validate` — ticker validation before save
- [x] `POST/GET /api/notes` — encrypted create + fetch
- [x] `GET/POST/PUT/DELETE /api/triggers` — full CRUD + rearm
- [x] `POST /api/chat` — Gemini AI chat endpoint
- [x] `GET /api/news` — Finnhub news proxy
- [x] `GET /api/user/export` + `DELETE /api/user/me` — stubbed
- [x] `GET /api/health` — key config status

---

## Phase 4 — Agent Skills Layer

- [x] `get_user_notes(ticker, user_id)` — decrypts notes in memory (`server/app/skills/notes.py`)
- [x] `get_market_news(ticker)` — Finnhub headlines + sentiment (`server/app/skills/news.py`)

---

## Phase 5 — Agentic Intelligence

- [x] `insight_engine.py` scaffolded
- [ ] **Pydantic AI not used** — plan called for `pydantic_ai.Agent`; code calls Gemini SDK directly (inconsistency #1)
- [ ] `agent_audit_logs` write before email delivery — not wired (table also missing)
- [ ] Resend email delivery — `send_email()` is `print()` (inconsistency #6)
- [ ] Phase 2: Migrate to Claude Sonnet with structured `InsightOutput` JSON

---

## Phase 6 — Continuous Monitoring (Worker)

- [x] `worker/trigger_worker.py` scaffolded
- [x] GitHub Actions cron workflow (`infra/.github/workflows/cron-triggers.yml`)
- [x] Market hours check (`is_market_open()`)
- [x] Cooldown logic for `auto_disarm = false` triggers
- [ ] `worker/requirements.txt` — **file missing**, cron will fail (inconsistency #4)
- [ ] `fetch_active_triggers()` — wire to Supabase (currently returns mock data)
- [ ] `batch_fetch_prices()` — wire to Polygon.io snapshot API (currently returns mock prices)
- [ ] `run_insight_agent()` — wire pydantic-ai + Gemini (currently returns template string)
- [ ] `send_email()` — wire Resend (currently `print()`) — needs RESEND_API_KEY
- [ ] `write_audit_log()` — wire to `agent_audit_logs` table (currently `print()`)
- [ ] `check_kill_switch()` — wire to `system_config` table (currently returns `False`)
- [ ] `update_trigger_post_fire()` — wire to Supabase update (currently `print()`)
- [ ] Add `RESEND_API_KEY` to `server/.env` (inconsistency #6)
- [ ] Add `CRON_SECRET` to `server/.env` + GitHub Actions secrets (inconsistency #7)

---

## Phase 7 — DevOps & GRC Hardening

- [x] `ci.yml` — lint, type check, test, dependency audit on PR
- [x] `cron-triggers.yml` — 15-min schedule + manual trigger
- [x] `deploy.yml` skeleton
- [ ] Render deploy hook URL — placeholder in `deploy.yml` (inconsistency #9)
- [ ] Sentry integration (FastAPI + React) — not yet added
- [ ] GitHub secret scanning — enable in repo settings
- [ ] `last_run_at` heartbeat written to `system_config` on each worker success
- [ ] Phase 2: OWASP ZAP self-audit

---

## Frontend Pages

- [x] `/` — Chat interface (AI chat, hint suggestions, persistent history)
- [x] `/alerts` — Alerts dashboard (grouped by ticker, proximity bars, signal badges)
- [x] `/notebook` — Trading journal (stats cards, active/triggered/trade tabs)
- [x] `/news` — Market news (Finnhub, sentiment badges)
- [x] `/settings` — Settings page (UI exists, all actions stubbed)
- [ ] `/ticker/[symbol]` — Route exists, page is empty
- [ ] `/stats` — Route exists, page is empty

---

## Frontend Wiring (UI exists, mutations not connected)

- [ ] `NewNoteForm` → `useNotes` create mutation
- [ ] `NewTriggerForm` → wired into Alerts page
- [ ] Rearm trigger button → `useTriggers` rearm mutation
- [ ] Trade logging UI → backend create/update endpoints
- [ ] Settings — save API key inputs (currently no-op)
- [ ] Settings — export data button → `GET /api/user/export`
- [ ] Settings — delete account button → `DELETE /api/user/me`
- [ ] Fix `user.py`: decrypt notes on export, cascade delete auth user in Supabase

---

## Environment Variables

| Key | Status |
|---|---|
| `SUPABASE_URL` | ✅ Set |
| `SUPABASE_ANON_KEY` | ✅ Set |
| `SUPABASE_SERVICE_KEY` | ✅ Set |
| `SUPABASE_JWT_SECRET` | ✅ Set |
| `MASTER_KEY` | ✅ Set — **never regenerate once notes exist** |
| `POLYGON_API_KEY` | ✅ Set |
| `FINNHUB_API_KEY` | ✅ Set |
| `GEMINI_API_KEY` | ✅ Set |
| `RESEND_API_KEY` | ❌ Not set |
| `CRON_SECRET` | ❌ Not set |
| `client/.env.local` | ❌ File missing |

---

## MVP Definition of Done

> "You set a trigger on a real ticker, the GitHub Actions cron catches it, and you receive an email with an AI summary of your notes and current news."

**Blockers remaining:**

1. Create `worker/requirements.txt`
2. Add `agent_audit_logs` + `system_config` tables to migration
3. Apply migration to Supabase
4. Wire all 7 stubbed worker functions
5. Add `RESEND_API_KEY` + `CRON_SECRET` to secrets
6. Create `client/.env.local`
