# Trader Notebook — Status
> Last updated: 2026-05-21

---

## Deployment

| Service | Status | URL |
|---|---|---|
| Frontend | ✅ Live on Vercel | Set in Vercel dashboard |
| Backend | ✅ Live on Render (free tier) | Set in Render dashboard |
| DB / Auth | ✅ Supabase | jhmzuielhxjasvgnheuy.supabase.co |
| Cron worker | ✅ GitHub Actions (every 15 min) | — |

**Known issue:** `NEXT_PUBLIC_API_URL` must be set in Vercel env vars → redeploy required for frontend to reach backend.

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
| `RESEND_API_KEY` | ❌ empty | ❌ empty | ❌ empty |
| `CRON_SECRET` | ❌ empty | ❌ empty | ❌ empty |
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
- [x] `GET/POST/PUT/DELETE /api/triggers` — full CRUD + rearm
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
- [x] `GET /api/insights` — aggregations by confidence/exit/horizon + Gemini coaching insights

### Chat (AI)
- [x] Multi-action support (single message → multiple simultaneous actions)
- [x] Full context injection (portfolios, alerts, watchlist, trades, notes)
- [x] Actions: `add_alert`, `create_portfolio`, `add_to_watchlist`, `log_trade`, `close_trade`, `assign_to_portfolio`, `add_journal_note`, `update_alert`, `delete_alert`
- [x] Clarifying questions when fields are missing
- [x] Note/thesis captured alongside alerts

### Frontend Pages
- [x] `/login` — username+password, sign up, forgot password
- [x] `/` — Chat (multi-action, undo/redo, persistent history)
- [x] `/alerts` — Alerts (grouped, proximity bars, delete buttons, undo/redo)
- [x] `/watchlist` — **NEW** Watchlist ideas (cards, filter tabs, edit/delete/undo, empty state)
- [x] `/notebook` — Tabs: active alerts, triggered, trades, portfolios, journal notes (real data)
- [x] `/news` — Market news (Finnhub, sentiment badges, watchlist-filtered, fully wired)
- [x] `/stats` — Real trade data + AI coaching insights via `/api/insights`
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
- [x] Trigger detection + price fetch
- [x] Gemini insight generation
- [x] Email via Resend (blocked on `RESEND_API_KEY`)
- [x] Audit logs

---

## Blockers (things stopping MVP from being complete)

1. **`RESEND_API_KEY`** — email alerts can't fire. Get key from resend.com, add to `server/.env`, Render env vars, and GitHub Actions secrets.
2. **`CRON_SECRET`** — cron worker auth not secured. Generate any random string, add to same three places.
3. **DB migrations** — confirm `001_initial_schema.sql` through `004_journal_notes.sql` are applied in Supabase SQL Editor.
4. **`NEXT_PUBLIC_API_URL`** in Vercel — frontend still hitting localhost in production.

---

## Next Up (priority order)

### ✅ Completed this sprint
- Watchlist page (`/watchlist`) with full CRUD + undo
- Stats page wired to real data + AI insights (`/api/insights`)
- Settings: username edit, export (real JSON download), delete account
- News page: already fully built, confirmed wired
- Notebook page: confirmed already using real hooks, no mocks

### Next — complete the email loop (needs your input)
1. Get `RESEND_API_KEY` from resend.com (free, 3k emails/month)
2. Set `CRON_SECRET` (any random string)
3. Add both to `server/.env`, Render env vars, and GitHub Actions secrets
4. Test: set an alert → wait for cron → email arrives

### Later — polish
5. Add historical trade context to alert emails (worker enhancement)
6. Sentry error tracking
