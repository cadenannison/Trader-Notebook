# Trader Notebook — Status
> Last updated: 2026-08-03

---

## Deployment

| Service | Status | URL |
|---|---|---|
| Frontend | ✅ Live on Vercel | Set in Vercel dashboard |
| Backend | ✅ Live on Render (free tier) | Set in Render dashboard |
| DB / Auth | ✅ Supabase | jhmzuielhxjasvgnheuy.supabase.co |
| Cron worker | ✅ GitHub Actions (every 15 min) | — |

All known deployment blockers resolved.

---

## Environment Variables

| Key | Local | Render | GitHub Secrets |
|---|---|---|---|
| `SUPABASE_URL` | ✅ | ✅ | ❓ confirm |
| `SUPABASE_ANON_KEY` | ✅ | ✅ | ❓ confirm |
| `SUPABASE_SERVICE_KEY` | ✅ | ✅ | ❓ confirm |
| `SUPABASE_JWT_SECRET` | ✅ | ✅ | ❓ confirm |
| `MASTER_KEY` | ✅ | ✅ (auto-gen) | ❓ confirm |
| `GEMINI_API_KEY` | ✅ | ✅ | ❓ confirm |
| `POLYGON_API_KEY` | ✅ | ✅ | ❓ confirm |
| `FINNHUB_API_KEY` | ✅ | ✅ | ❓ confirm |
| `RESEND_API_KEY` | ✅ | ✅ | ✅ |
| `CRON_SECRET` | ✅ | ✅ | ✅ |
| `NEXT_PUBLIC_API_URL` | localhost | — | — |
| `CLIENT_URL` | localhost | ❓ set to Vercel URL? | — |

---

## What Is Built

### Auth
- [x] Supabase email+password auth (replaced OTP magic links)
- [x] Username-based login (backend lookup via `/api/auth/lookup`)
- [x] Username stored in Supabase user_metadata at signup
- [x] Username displayed in sidebar
- [x] Password reset flow (email-based)
- [x] AuthGuard (redirects unauthenticated users to /login)

### Backend
- [x] JWT auth middleware
- [x] AES-256-GCM per-user note encryption
- [x] Rate limiting (slowapi)
- [x] CORS (allows CLIENT_URL + *.vercel.app + localhost)
- [x] `GET /api/health`
- [x] `GET /api/stock/price`, `GET /api/stock/validate`
- [x] `POST/GET /api/notes` — encrypted notes
- [x] `GET/POST/PUT/DELETE /api/triggers` — full CRUD + rearm; supports `price_level`, `pct_move`, `earnings_warning`
- [x] `GET/POST/PUT/DELETE /api/trades` — full CRUD + close
- [x] `GET/POST/PUT/DELETE /api/watchlist`
- [x] `GET/POST/PUT/DELETE /api/portfolios`
- [x] `GET/POST/PUT/DELETE /api/journal_notes`
- [x] `POST /api/chat` — multi-action Gemini AI (actions array)
- [x] `GET /api/news` — Finnhub proxy
- [x] `GET /api/briefing` — daily briefing endpoint (exists, untested)
- [x] `GET /api/auth/lookup` — username → email lookup
- [x] `GET /api/user/export` — decrypts all notes/journal, returns full JSON
- [x] `DELETE /api/user/me` — cascades all tables + Supabase auth.admin.delete_user
- [x] `GET /api/insights` — aggregations by confidence/exit/horizon + Gemini coaching insights + exit behavior + performance trend

### Chat (AI)
- [x] Multi-action support (single message → multiple simultaneous actions)
- [x] Full context injection (portfolios, alerts, watchlist, trades, notes)
- [x] Actions: `add_alert`, `create_portfolio`, `add_to_watchlist`, `log_trade`, `close_trade`, `assign_to_portfolio`, `add_journal_note`, `update_alert`, `delete_alert`
- [x] Clarifying questions when fields are missing
- [x] Note/thesis captured alongside alerts
- [x] Pre-trade checklist modal (thesis match + exit plan) before every `log_trade`

### Frontend Pages
- [x] `/login` — username+password, sign up, forgot password
- [x] `/` — Chat (multi-action, undo/redo, persistent history)
- [x] `/alerts` — Alerts (grouped, proximity bars, delete buttons, undo/redo)
- [x] `/watchlist` — **NEW** Watchlist ideas (cards, filter tabs, edit/delete/undo, empty state)
- [x] `/notebook` — Tabs: active alerts, triggered, trades, portfolios, journal notes (real data)
- [x] `/news` — Market news (Finnhub, sentiment badges, watchlist-filtered, fully wired)
- [x] `/stats` — Real trade data + AI coaching insights + exit behavior breakdown + performance trend
- [x] `/settings` — Username edit, export (downloads JSON), delete account (confirmation modal)
- [x] `/ticker/[symbol]` — Fully wired

### Infrastructure
- [x] Undo/redo system (global Zustand store, UndoBar in AppShell, ⌘Z/⌘⇧Z)
- [x] CI pipeline (ruff, bandit, pip-audit, pytest, gitleaks)
- [x] Cron trigger worker (GitHub Actions, every 15 min)
- [x] Render deploy via `render.yaml` blueprint
- [x] Secret scanning (gitleaks pre-commit + CI)
- [x] `deploy.yml` — exists and wired to Render hook

### Worker
- [x] Market hours check
- [x] Kill switch
- [x] Trigger detection + price fetch; supports `price_level`, `pct_move`, `earnings_warning`
- [x] Historical trade context in alert emails
- [x] Gemini insight generation
- [x] Email via Resend
- [x] Behavioral alerts in daily briefing (FOMO streak, panic-sold streak)
- [x] Audit logs

### Observability
- [x] Sentry error tracking (server + both workers; guarded init, SENTRY_DSN secret)

---

## Blockers

~~All MVP blockers resolved.~~

### Fixed 2026-08-04
- ~~Gemini calls returning `429 RESOURCE_EXHAUSTED` / `limit: 0`~~ — not a dead key or a billing problem. Google has zeroed out free-tier quota for the pinned model IDs (`gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-2.5-flash`) on new accounts/projects; the rolling aliases (`gemini-flash-latest`, `gemini-flash-lite-latest`) work fine on the same key. Repointed every hardcoded model reference: `server/app/agents/insight_engine.py`, `server/app/api/chat.py` (`_MODELS`), `server/app/api/briefing.py`, `server/app/api/insights.py`, `worker/trigger_worker.py`, `worker/daily_briefing.py`, `worker/weekly_digest.py`. Verified against the live API with the real code path (`insight_engine._call_gemini`), not just a curl probe.

### Fixed 2026-08-03
- ~~`worker/tests/` not run by CI~~ — added a `worker` job to `.github/workflows/ci.yml` (mirrors the `server` job: installs `worker/requirements.txt` + `pytest`, runs `pytest worker/tests/`). Verified against a clean venv, not just the local dev one.
- ~~`worker/requirements.txt` pinned `pydantic==2.7.1`, incompatible with Python 3.13~~ — relaxed all exact pins in `worker/requirements.txt` to `>=` floors matching `server/requirements.txt`'s style (`supabase>=2.10.0`, `pydantic>=2.10.0`, etc.). All 24 worker tests now collect and pass, locally and in a from-scratch venv.
- Added the worker suite to `make test` so `worker/`, `server/`, and `client/` all run in one command.

---

## Next Up (priority order)

### ✅ Completed this sprint
- Watchlist page (`/watchlist`) with full CRUD + undo
- Stats page wired to real data + AI insights + exit behavior + performance trend
- Settings: username edit, export (real JSON download), delete account
- News page: fully built and wired
- Notebook page: fully wired to real hooks
- All ops blockers resolved (RESEND_API_KEY, CRON_SECRET, DB migrations, NEXT_PUBLIC_API_URL)
- Chat: SSE streaming, 7 live data tools, prompt injection protection
- Daily briefing: endpoint + worker + GitHub Actions workflow
- Historical trade context in trigger alert emails
- Expanded trigger types: `price_level`, `pct_move`, `earnings_warning` (DB + API + worker + frontend)
- Sentry error tracking (server + both workers)
- Pre-trade checklist modal (thesis match + exit plan)
- Pattern engine: exit behavior stats + performance trend in `/api/insights` + stats UI
- Behavioral alerts: FOMO and panic-sold streak detection in daily briefing email
- Mobile responsive layout: bottom nav, sidebar hidden on mobile, `md:ml-[220px]` main offset, grid fixes on stats + notebook
- Trigger history: `trigger_logs` table + worker writes on every fire + `GET /api/trigger_logs` + alerts page clock-icon history panel per alert

### Deferred
- Claude API upgrade (Gemini → Claude) — on hold, revisit later

### Possible next steps
1. **Onboarding flow** — empty-state guidance for new users (no trades, no watchlist)
2. **Push / in-app notifications** — browser push or in-app toast when a trigger fires (currently email-only)
3. **Portfolio analytics** — per-portfolio win rate / return breakdown on the stats page
4. **Multi-asset support** — crypto or options tickers (currently US equities only via Polygon)
5. **Full pattern engine** — `/api/insights` currently covers exit behavior + performance trend; spec calls for 6 dimensions total (setup type, idea source, time horizon, confidence at entry, stop-loss override behavior, exit-vs-target pattern)
6. **Mobile app** — React Native + Expo, sharing `shared/types.ts` and the existing FastAPI backend (no new API work needed); scope: chat, alerts, watchlist views, native push notifications

---

## Guardrails (carried over from the old implementation plan)
- `server/app/crypto/keys.py` — do not change key derivation
- `MASTER_KEY` — never regenerate once any notes exist in production (see key rotation procedure in `GAMEPLAN.md` §14.F)
- `infra/migrations/001_initial_schema.sql` — do not modify; only add new migration files
