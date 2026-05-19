# Trader Notebook — Plan vs. Reality

> Updated 2026-05-10. Tracks what the GAMEPLAN.md called for vs. what's actually built.

---

## Inconsistencies (plan said X, code does Y)

| # | Plan | Reality | Status |
|---|---|---|---|
| 1 | "Gemini 2.0 Flash **via Pydantic AI**" | Code uses direct Gemini SDK — `pydantic-ai` is not installed or used anywhere | Open |
| 2 | `agent_audit_logs` table defined in Phase 2 schema | Now in `infra/migrations/001_initial_schema.sql` | ✅ Resolved |
| 3 | `system_config` table defined in Phase 2 schema | Now in `infra/migrations/001_initial_schema.sql` | ✅ Resolved |
| 4 | `worker/requirements.txt` listed in monorepo layout | File now exists | ✅ Resolved |
| 5 | Worker wires Supabase + Polygon + Resend end-to-end | All 7 functions wired to real services | ✅ Resolved |
| 6 | Resend email on trigger fire (MVP scope) | `send_email()` calls Resend SDK — but `RESEND_API_KEY` is still an empty string | Open |
| 7 | CRON_SECRET for authenticating cron job | Key exists in `.env` but value is empty | Open |
| 8 | `client/.env.local` with Supabase public keys | File now exists | ✅ Resolved |
| 9 | Render deploy hook in `deploy.yml` | `deploy.yml` does not exist at all in workflows | Open |

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
- [x] Secret scanning — gitleaks + detect-secrets as pre-commit hooks
- [x] Secret scanning — gitleaks-action in CI (runs on every push)

---

## Phase 2 — Secure Data Foundation

- [x] Supabase Auth with RLS enabled
- [x] `notes` table schema with RLS policy
- [x] `triggers` table schema with RLS policy
- [x] AES-256-GCM per-user encryption (`server/app/crypto/keys.py`)
- [x] `agent_audit_logs` table in migration
- [x] `system_config` table for kill switch in migration
- [ ] Apply `infra/migrations/001_initial_schema.sql` to Supabase — **tables not yet confirmed created in DB**
- [x] `client/.env.local` — exists

---

## Phase 3 — API & Service Mesh

- [x] CORS middleware locked to `CLIENT_URL`
- [x] Supabase JWT validation middleware (`server/app/middleware/auth.py`)
- [x] Rate limiting via `slowapi` on all endpoints
- [x] `GET /api/stock/price` — Polygon.io proxy
- [x] `GET /api/stock/validate` — ticker validation before save
- [x] `POST/GET /api/notes` — encrypted create + fetch
- [x] `GET/POST/PUT/DELETE /api/triggers` — full CRUD + rearm
- [x] `POST /api/chat` — Gemini AI chat endpoint
- [x] `GET /api/news` — Finnhub news proxy
- [x] `GET /api/health` — key config status
- [ ] `GET /api/user/export` — wired but TODO: decrypt notes before returning
- [ ] `DELETE /api/user/me` — wired but TODO: cascade delete Supabase auth user

---

## Phase 4 — Agent Skills Layer

- [x] `get_user_notes(ticker, user_id)` — decrypts notes in memory (`server/app/skills/notes.py`)
- [x] `get_market_news(ticker)` — Finnhub headlines + sentiment (`server/app/skills/news.py`)

---

## Phase 5 — Agentic Intelligence

- [x] `insight_engine.py` scaffolded and integrated in worker
- [ ] **Pydantic AI not used** — plan called for `pydantic_ai.Agent`; code calls Gemini SDK directly (inconsistency #1)
- [x] `write_audit_log()` wired to `agent_audit_logs` before email delivery
- [ ] `send_email()` Resend call wired — blocked on `RESEND_API_KEY` being set (inconsistency #6)
- [ ] Phase 2: Migrate to Claude Sonnet with structured `InsightOutput` JSON

---

## Phase 6 — Continuous Monitoring (Worker)

- [x] `worker/trigger_worker.py` fully implemented
- [x] `worker/requirements.txt` — file exists
- [x] GitHub Actions cron workflow (`infra/.github/workflows/cron-triggers.yml`)
- [x] Market hours check (`is_market_open()`)
- [x] Cooldown logic for `auto_disarm = false` triggers
- [x] `fetch_active_triggers()` — wired to Supabase
- [x] `batch_fetch_prices()` — wired to Polygon.io snapshot API
- [x] `run_insight_agent()` — wired to Gemini SDK (not pydantic-ai)
- [x] `write_audit_log()` — wired to `agent_audit_logs` table
- [x] `check_kill_switch()` — wired to `system_config` table
- [x] `update_trigger_post_fire()` — wired to Supabase update
- [ ] `send_email()` — wired but blocked on empty `RESEND_API_KEY`
- [ ] `last_run_at` heartbeat written to `system_config` on each worker success
- [ ] Add real value for `RESEND_API_KEY` in `server/.env` + GitHub Actions secrets
- [ ] Add real value for `CRON_SECRET` in `server/.env` + GitHub Actions secrets

---

## Phase 7 — DevOps & GRC Hardening

- [x] `ci.yml` — lint (ruff), bandit security scan, type check, dependency audit (pip-audit), 70 tests on PR
- [x] `cron-triggers.yml` — 15-min schedule + manual trigger
- [x] Secret scanning — gitleaks pre-commit + gitleaks-action CI
- [ ] `deploy.yml` — file does not exist; Render deploy hook not wired (inconsistency #9)
- [ ] Sentry integration (FastAPI + React) — not yet added
- [ ] GitHub secret scanning — enable in repo Settings → Security → Secret scanning
- [ ] `last_run_at` heartbeat in `system_config`
- [ ] Phase 2: OWASP ZAP self-audit

---

## Frontend Pages

- [x] `/` — Chat interface (AI chat, hint suggestions, persistent history, can create triggers)
- [x] `/alerts` — Alerts dashboard (grouped by ticker, proximity bars, signal badges)
- [x] `/notebook` — Trading journal (stats cards, active/triggered/trade tabs)
- [x] `/news` — Market news (Finnhub, sentiment badges)
- [x] `/settings` — Settings page (UI exists, export/delete stubbed)
- [x] `/ticker/[symbol]` — Per-ticker page with notes, triggers, price (fully wired with hooks)
- [x] `/stats` — Stats page with win rate, avg return, best trade (using mock trade data)

---

## Frontend Wiring

- [x] `NewNoteForm` → `useCreateNote` mutation — wired
- [x] `NewTriggerForm` → `useCreateTrigger` mutation — wired (Alerts page + ticker page + chat page)
- [x] Rearm trigger button → `useRearmTrigger` mutation — wired in `TriggerCard`
- [x] Delete trigger → `useDeleteTrigger` mutation — wired in `TriggerCard`
- [ ] Trade logging UI → backend create/update endpoints (currently using `MOCK_TRADES`)
- [ ] Settings — export data button → `GET /api/user/export` (currently `alert()`)
- [ ] Settings — delete account button → `DELETE /api/user/me` (currently `alert()`)

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
| `RESEND_API_KEY` | ❌ Empty — worker email delivery blocked |
| `CRON_SECRET` | ❌ Empty |
| `client/.env.local` | ✅ Exists |

---

## MVP Definition of Done

> "You set a trigger on a real ticker, the GitHub Actions cron catches it, and you receive an email with an AI summary of your notes and current news."

**Blockers remaining:**

1. Set `RESEND_API_KEY` in `server/.env` + GitHub Actions secrets
2. Set `CRON_SECRET` in `server/.env` + GitHub Actions secrets
3. Apply migration to Supabase (confirm tables exist in DB)
4. Create `deploy.yml` for Render auto-deploy

**After MVP — Phase 2 backlog:**

- Wire trade logging to backend (replace `MOCK_TRADES`)
- Wire Settings export + delete account actions
- Implement note decrypt in `/api/user/export`
- Implement cascade auth delete in `/api/user/me`
- Sentry integration (FastAPI + React)
- Enable GitHub secret scanning in repo settings
- Add `last_run_at` heartbeat to `system_config`
- Migrate insight agent to Claude Sonnet with structured `InsightOutput`
- SSE live price stream
- Browser push notifications
- In-app notification feed
- OWASP ZAP self-audit
