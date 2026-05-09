# Trader Notebook — Engineering Gameplan

> **Philosophy:** "Shift-Left" security — build it in from day one, not bolt it on later. Every layer operates on least-privilege access, and every AI action is auditable before the user sees it.

---

## Confirmed Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Auth | Supabase Auth | Already integrated with RLS — `auth.uid()` just works |
| Database | Supabase PostgreSQL | No pgvector — dropped from MVP |
| AI Provider | Gemini 2.0 Flash | Free tier (1,500 req/day) — migrate to Claude in Phase 2 for structured output |
| Agent Skills | In-process Python functions | No separate MCP processes — same security, zero extra ops overhead |
| Trigger Worker | GitHub Actions Python script | Bypasses Render cold start entirely — runs in the Actions runner |
| MVP Scope | Note → Trigger → Email | Ship the core loop first; everything else is Phase 2 |

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [MVP Boundary](#2-mvp-boundary)
3. [Architecture at a Glance](#3-architecture-at-a-glance)
4. [Tech Stack & Cost Summary](#4-tech-stack--cost-summary)
5. [Monorepo Layout](#5-monorepo-layout)
6. [Phase 1 — Governance & Scaffold](#6-phase-1--governance--scaffold)
7. [Phase 2 — Secure Data Foundation](#7-phase-2--secure-data-foundation)
8. [Phase 3 — API & Service Mesh](#8-phase-3--api--service-mesh)
9. [Phase 4 — Agent Skills Layer](#9-phase-4--agent-skills-layer)
10. [Phase 5 — Agentic Intelligence](#10-phase-5--agentic-intelligence)
11. [Phase 6 — Continuous Monitoring](#11-phase-6--continuous-monitoring)
12. [Phase 7 — DevOps & GRC Hardening](#12-phase-7--devops--grc-hardening)
13. [Implementation Flow](#13-implementation-flow)
14. [Additional Considerations](#14-additional-considerations)
15. [Trigger UX & Advanced Settings](#15-trigger-ux--advanced-settings)
16. [Worker Operational Considerations](#16-worker-operational-considerations)

---

## 1. Project Overview

**Trader Notebook** is a secure, AI-augmented trading journal that bridges the gap between raw financial data and human intent. A user logs notes and price-trigger alerts on any stock ticker. When a trigger fires, an AI agent cross-references the user's own past writing with current market news and produces an auditable insight — delivered by email before the user even opens the app.

**Core design constraints:**
- Solo developer, student budget — target cost is **< $1/month**
- Enterprise-grade security posture from day one
- Every AI action is logged before it reaches the user
- The app never exposes third-party API keys to the browser

---

## 2. MVP Boundary

The MVP is the smallest thing that proves the core loop works. Build this first. Everything beyond it is Phase 2.

```
MVP = Note + Trigger + Email Insight
```

| Feature | MVP | Phase 2 |
|---|---|---|
| Write a note for a ticker | Yes | |
| Set a price trigger (above/below) | Yes | |
| Email when trigger fires (Resend) | Yes | |
| Basic AI summary in email | Yes | |
| Semantic/vector note search | | Yes |
| Browser push notifications | | Yes |
| In-app notification feed | | Yes |
| Structured InsightOutput JSON | | Yes (switch to Claude) |
| SSE live price stream | | Yes |
| OWASP ZAP self-audit | | Yes |

**Definition of done for MVP:** You set a trigger on a real ticker, the GitHub Actions cron catches it, and you receive an email with an AI summary of your notes and current news.

---

## 3. Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React / Next.js)                                  │
│  - TanStack Query for server state                          │
│  - Zustand for UI state                                     │
└────────────────────────┬────────────────────────────────────┘
                         │  HTTPS only — no API keys in browser
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  FastAPI Backend (Render)                                   │
│  - Supabase Auth JWT validation middleware                  │
│  - Rate limiting middleware (slowapi)                       │
│  - Secret proxy: holds all third-party API keys            │
│  - /api/stock/price, /api/triggers, /api/notes             │
└────────────────────┬────────────────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
  ┌───────────────┐    ┌────────────────────────────────────┐
  │   Supabase    │    │  Agent Skills (in-process Python)  │
  │   Postgres    │    │  - get_user_notes(ticker)          │
  │   RLS: uid    │    │  - get_market_news(ticker)         │
  └───────────────┘    │  - Gemini 2.0 Flash orchestrates   │
                       └────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  GitHub Actions Cron (every 15 min)                         │
│  Python script runs directly in Actions runner              │
│  → Connects to Supabase + Polygon.io directly               │
│  → No HTTP call to Render — no cold start problem           │
│  → On trigger hit: runs agent → sends Resend email          │
└─────────────────────────────────────────────────────────────┘
```

**MVP trigger flow:**

```
GitHub Actions Cron (15 min)
  → Python script checks out repo, runs trigger_worker.py
  → Fetches active triggers from Supabase
  → Batch price fetch from Polygon.io (one call for all tickers)
  → Compare prices vs. triggers
  → Trigger hit:
      → get_user_notes(ticker) — decrypt in memory
      → get_market_news(ticker) — fetch headlines
      → Gemini 2.0 Flash synthesizes summary
      → Write to agent_audit_logs
      → Send email via Resend
```

---

## 4. Tech Stack & Cost Summary

| Layer | Provider | Cost |
|---|---|---|
| Database + Auth | Supabase | $0 (Free Tier) |
| Frontend | Vercel | $0 (Free Tier) |
| Backend API | Render | $0 (Free Tier) |
| Trigger Worker | GitHub Actions | $0 (2,000 mins/month free) |
| AI — MVP | Gemini 2.0 Flash | $0 (1,500 req/day free) |
| AI — Phase 2 | Claude Sonnet | ~$0.05 per 100 insights |
| Stock Data | Polygon.io | $0 (Free Tier, 15-min delayed) |
| News Data | NewsAPI / Finnhub | $0 (Free Tier) |
| Email Notifications | Resend | $0 (3,000 emails/month free) |
| Error Tracking | Sentry | $0 (Free Tier) |
| **TOTAL** | | **$0 / month on MVP** |

> **Note on Polygon.io:** Free tier data is delayed 15 minutes. Tight price targets may be missed during fast moves. This is acceptable for a personal journal — set expectations accordingly.

> **Note on Render:** Free tier instances spin down after 15 minutes of inactivity. The trigger worker runs directly in GitHub Actions and is unaffected. The FastAPI endpoint will cold-start on the first user request after idle (~30–60s) — expected behavior for a free tier app.

---

## 5. Monorepo Layout

```
trader-notebook/
├── client/              # React / Next.js frontend
│   └── src/
│       ├── components/
│       ├── hooks/           # TanStack Query hooks
│       └── store/           # Zustand stores
├── server/              # FastAPI backend
│   ├── app/
│   │   ├── api/             # Route handlers
│   │   ├── agents/          # Pydantic AI agent definitions
│   │   ├── skills/          # In-process agent skill functions
│   │   ├── middleware/      # JWT validation, rate limiting
│   │   └── crypto/          # Encryption/decryption utilities
│   └── tests/
├── worker/              # Standalone trigger worker (runs in GitHub Actions)
│   ├── trigger_worker.py
│   └── requirements.txt
├── shared/              # Single source of truth for data shapes
│   ├── types.ts             # TypeScript interfaces (frontend consumes)
│   └── models.py            # Pydantic models (backend + worker consume)
├── infra/
│   ├── migrations/          # Alembic migration files
│   ├── docker-compose.yml   # Local dev environment
│   └── .github/
│       └── workflows/
│           ├── ci.yml              # Test + lint on PR
│           ├── deploy.yml          # Deploy on merge to main
│           └── cron-triggers.yml   # 15-min trigger worker
├── .env.example         # Committed — documents required secrets
├── .env                 # Gitignored — real secrets
└── Makefile             # `make dev`, `make test`, `make migrate`
```

---

## 6. Phase 1 — Governance & Scaffold

**Goal:** Establish legal and technical boundaries before writing a single line of product code.

### Actions
- Initialize repo with a **PolyForm Noncommercial License** — free for personal use, prevents commercial exploitation.
- Configure **strict TypeScript** (`"strict": true`, `"noImplicitAny": true`) in `client/tsconfig.json`.
- Configure **strict Pydantic** (`model_config = ConfigDict(strict=True)`) in `server/`.
- Verify your Resend sending domain — DNS propagation takes up to 48 hours. Do this on day one so email is ready when the first trigger fires.
- Generate and store `MASTER_KEY` in three places before writing a single note: Render env vars, GitHub Actions secrets, and a password manager. Losing this key makes all notes permanently unreadable.

### Linting, Formatting & Pre-commit Hooks

Set these up before writing any product code. Retrofitting them is painful.

- **Python:** `ruff` (replaces black + flake8 + isort in one tool)
- **TypeScript:** `eslint` + `prettier`
- **Pre-commit:** runs both on every commit so messy code never enters the repo

```bash
# Install pre-commit
pip install pre-commit
```

```yaml
# .pre-commit-config.yaml (repo root)
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.4.0
    hooks:
      - id: ruff
        args: [--fix]
  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v4.0.0
    hooks:
      - id: prettier
        types_or: [ts, tsx, json]
```

```bash
pre-commit install  # runs automatically on every git commit from here on
```

### Monorepo Tooling — Making `shared/` Importable

The shared schema only works if both sides can actually import it. This needs to be wired up before writing any types.

**TypeScript side** — path alias in `client/tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["../shared/*"]
    }
  }
}
```

Then import as: `import type { PriceTrigger } from "@shared/types"`

**Python side** — add `shared/` to the path at the top of any Python file that imports from it:
```python
# worker/trigger_worker.py and server/app/main.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from shared.models import PriceTrigger
```

Or make `shared/` a proper Python package by adding an empty `shared/__init__.py` and installing it in editable mode via `pyproject.toml`. Either approach works — pick one and be consistent.

### Shared Schema

`StockData`, `UserNote`, and `PriceTrigger` are defined once and consumed by both the frontend and the backend. Schema drift — where the frontend expects a field the backend stopped sending — is caught instantly by the type system rather than at runtime.

**`shared/types.ts`**
```typescript
export interface StockData {
  ticker: string;
  price: number;
  timestamp: string; // ISO 8601
  change_pct: number;
}

export interface UserNote {
  id: string;
  ticker: string;
  content: string;     // plaintext — never stored; only in memory
  created_at: string;
}

export interface PriceTrigger {
  id: string;
  ticker: string;
  target_price: number;
  condition: "above" | "below";
  is_active: boolean;
  auto_disarm: boolean;       // default true — deactivates after firing; user must re-arm
  cooldown_hours: number;     // only applies when auto_disarm is false; default 4
  last_triggered_at: string | null;
}
```

**`shared/models.py`**
```python
from pydantic import BaseModel, ConfigDict
from enum import Enum

class TriggerCondition(str, Enum):
    above = "above"
    below = "below"

class StockData(BaseModel):
    model_config = ConfigDict(strict=True)
    ticker: str
    price: float
    timestamp: str
    change_pct: float

class UserNote(BaseModel):
    model_config = ConfigDict(strict=True)
    id: str
    ticker: str
    content: str  # plaintext — decrypted in memory only
    created_at: str

class PriceTrigger(BaseModel):
    model_config = ConfigDict(strict=True)
    id: str
    ticker: str
    target_price: float
    condition: TriggerCondition
    is_active: bool
    auto_disarm: bool = True      # default: deactivate after firing; user must re-arm
    cooldown_hours: int = 4       # only used when auto_disarm is False
    last_triggered_at: str | None = None
```

---

## 7. Phase 2 — Secure Data Foundation

**Goal:** Offload auth to Supabase. Ensure a full database dump leaks nothing readable.

### Supabase Setup
1. Enable **Row Level Security** on all user tables — default-deny posture.
2. No pgvector extension needed for MVP.

### RLS Policy Pattern
```sql
CREATE POLICY "user_owns_row" ON notes
  FOR ALL USING (auth.uid() = user_id);
```

Apply this pattern to `notes`, `triggers`, and `agent_audit_logs`.

### Database Schema

**`notes` table**
```sql
CREATE TABLE notes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker            TEXT NOT NULL,
  encrypted_content BYTEA NOT NULL,  -- AES-256 ciphertext; never plaintext at rest
  created_at        TIMESTAMPTZ DEFAULT NOW()
  -- no updated_at: notes are intentionally immutable (see below)
);
```

**Notes are immutable (append-only).** To update your thinking, write a new note. There is no edit or delete on individual notes — only the full account deletion endpoint removes them. This is the right product decision for a trading journal: the agent seeing how your thinking evolved over time is part of the value. It also simplifies encryption significantly — you never need to re-encrypt an existing row.

**`triggers` table**
```sql
CREATE TABLE triggers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker           TEXT NOT NULL,
  target_price     NUMERIC(12, 4) NOT NULL,
  condition        TEXT CHECK (condition IN ('above', 'below')) NOT NULL,
  is_active        BOOLEAN DEFAULT TRUE,
  auto_disarm      BOOLEAN DEFAULT TRUE,   -- true: deactivate after firing (default)
                                           -- false: stay armed, respect cooldown_hours
  cooldown_hours   INTEGER DEFAULT 4,      -- minimum hours between firings (auto_disarm = false only)
  last_triggered_at TIMESTAMPTZ,           -- used for cooldown calculation
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

**Trigger behavior logic:**
- `auto_disarm = TRUE` (default): trigger fires once → `is_active` flips to `FALSE` → user manually re-arms in the UI. No spam possible.
- `auto_disarm = FALSE` (advanced): trigger stays armed → worker checks `last_triggered_at`; skips if within `cooldown_hours`. User sets the cooldown in Advanced Settings.

**`agent_audit_logs` table**
```sql
CREATE TABLE agent_audit_logs (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  agent_id  TEXT NOT NULL,
  action    TEXT NOT NULL,   -- e.g. 'tool_call:get_user_notes'
  metadata  JSONB,
  user_id   UUID REFERENCES auth.users(id)
);
```

**`system_config` table** (kill switch)
```sql
CREATE TABLE system_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO system_config VALUES ('maintenance_mode', 'false');
```

### Application-Level Encryption

```
User types note → React sends POST /api/notes (JWT in Authorization header)
  → FastAPI validates JWT with Supabase Auth
  → Derives per-user encryption key (HKDF from MASTER_KEY + user_id)
  → Encrypts content with AES-256 (Python cryptography library)
  → Stores BYTEA ciphertext in Postgres
  → A full DB dump reveals only random bytes
```

---

## 8. Phase 3 — API & Service Mesh

**Goal:** Build a proxy layer so the browser never talks to external services directly and never holds a secret key.

### The Secret Proxy Pattern

```
React → GET /api/stock/price?ticker=NVDA
  → FastAPI validates Supabase Auth JWT
  → Reads POLYGON_API_KEY from Render environment variables
  → Calls Polygon.io
  → Strips unnecessary fields
  → Returns lean JSON to React
```

The browser sees only your domain. Polygon.io never sees the user's identity.

### Middleware Stack

```python
# server/app/main.py — order matters
app.add_middleware(CORSMiddleware, allow_origins=[settings.CLIENT_URL], ...)
app.add_middleware(RateLimitMiddleware, ...)
app.add_middleware(SupabaseJWTMiddleware, ...)
```

### CORS — Lock to Your Vercel Domain

`allow_origins=["*"]` is a common mistake that allows any website to make authenticated requests to your API on behalf of a logged-in user. It must be locked to your Vercel domain before the first deploy.

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.CLIENT_URL],   # e.g. "https://trader-notebook.vercel.app"
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

`CLIENT_URL` lives in the Render environment variables, not hardcoded. For local development it's `http://localhost:3000`.

### Ticker Validation Endpoint

Without this, a user who miskeys a ticker (e.g. `NFDIA` instead of `NVDA`) gets a trigger that silently never fires. Add a validation route that checks the symbol against Polygon.io before it's saved.

```python
# server/app/api/stock.py
@app.get("/api/stock/validate")
@limiter.limit("20/minute")
async def validate_ticker(ticker: str, request: Request):
    ticker = ticker.upper().strip()
    if not re.match(r'^[A-Z]{1,10}$', ticker):
        raise HTTPException(status_code=400, detail="Invalid ticker format")
    result = await polygon.get_ticker_details(ticker)
    if not result:
        raise HTTPException(status_code=404, detail="Ticker not found")
    return {"ticker": ticker, "name": result.name}
```

Call this on blur in the ticker input field in the UI — show a checkmark if valid, an error if not — before allowing the note or trigger to be saved.

### Rate Limiting

Prevents a compromised session from exhausting free-tier API quotas.

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@app.get("/api/stock/price")
@limiter.limit("30/minute")
async def get_stock_price(ticker: str, request: Request):
    ...
```

---

## 9. Phase 4 — Agent Skills Layer

**Goal:** The agent gets functions, not database access. Skills are plain Python functions — no separate MCP process, no inter-process communication.

### Skill 1 — get_user_notes

Fetches and decrypts the user's notes for a specific ticker. The agent receives plaintext. The encryption key never leaves the backend.

```python
# server/app/skills/notes.py
async def get_user_notes(ticker: str, user_id: str, db) -> list[str]:
    rows = await db.fetch(
        "SELECT encrypted_content FROM notes WHERE ticker = $1 AND user_id = $2",
        ticker, user_id
    )
    key = derive_key(settings.MASTER_KEY, user_id)
    return [decrypt(row["encrypted_content"], key) for row in rows]
```

### Skill 2 — get_market_news

Fetches the top 5 current headlines for a ticker. Uses a server-side API key.

```python
# server/app/skills/news.py
async def get_market_news(ticker: str) -> list[str]:
    # Calls NewsAPI / Finnhub with NEWSAPI_KEY from environment
    # Returns headline + one-sentence summary only
    ...
```

**Security constraint:** Neither skill accepts arbitrary input beyond the ticker string. Neither has write access to the database.

---

## 10. Phase 5 — Agentic Intelligence

**Goal:** Orchestrate AI logic with type-safe, auditable output. Every agent thought is logged before the user sees it.

### MVP Agent (Gemini 2.0 Flash)

For the MVP, the agent produces a plain-text email summary. Structured JSON output (`InsightOutput`) is a Phase 2 upgrade when switching to Claude.

```python
# server/app/agents/insight_engine.py
from pydantic_ai import Agent
from pydantic_ai.models.gemini import GeminiModel

insight_agent = Agent(
    model=GeminiModel("gemini-2.0-flash"),
    system_prompt="""
        You are a Financial Auditor assistant. Be objective, data-driven, and concise.
        Summarize what the user previously wrote about this stock and what the market
        is doing now. Never give financial advice. Never fabricate data.
        If you lack information, say so explicitly. Respond in 3-5 sentences.
    """,
)
```

### Phase 2 Agent (Claude — structured output)

```python
# Phase 2 upgrade — swap model and add result_type
from pydantic import BaseModel

class InsightOutput(BaseModel):
    summary: str
    user_intent: str
    market_context: str
    recommended_action: str  # "Review", "Hold", "Act" — never financial advice
    confidence: float        # 0.0 to 1.0

insight_agent = Agent(
    model="claude-sonnet-4-6",
    result_type=InsightOutput,
    ...
)
```

### The Logic Gate

```
IF current_price reaches target_price → invoke insight_agent
```

### Reasoning Loop

```
1. get_user_notes(ticker, user_id)  → decrypted note content
2. get_market_news(ticker)          → top 5 headlines
3. Synthesize(notes + news + trigger context)
4. Write full trace to agent_audit_logs BEFORE sending email
5. Send Resend email with summary
```

### Audit Before Delivery

```python
await db.execute("""
    INSERT INTO agent_audit_logs (agent_id, action, metadata, user_id)
    VALUES ($1, $2, $3, $4)
""", "insight_engine_v1", "synthesis_complete", {"ticker": ticker, "trigger_id": trigger_id}, user_id)
```

---

## 11. Phase 6 — Continuous Monitoring

**Goal:** Triggers fire reliably when your laptop is closed, within free-tier limits.

### Architecture Decision

The trigger worker is a **standalone Python script** that runs directly inside the GitHub Actions runner. It connects to Supabase and Polygon.io using secrets stored in GitHub. There is no HTTP call to Render — no cold start, no timeout risk.

### GitHub Actions Workflow

```yaml
# infra/.github/workflows/cron-triggers.yml
on:
  schedule:
    - cron: '*/15 * * * *'

jobs:
  check-triggers:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - run: pip install -r worker/requirements.txt

      - run: python worker/trigger_worker.py
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          POLYGON_API_KEY: ${{ secrets.POLYGON_API_KEY }}
          NEWSAPI_KEY: ${{ secrets.NEWSAPI_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          MASTER_KEY: ${{ secrets.MASTER_KEY }}
```

### Trigger Worker Logic (Cost-Optimized)

```python
# worker/trigger_worker.py
import asyncio
from supabase import create_client

async def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Check kill switch first
    config = supabase.table("system_config").select("value").eq("key", "maintenance_mode").single().execute()
    if config.data["value"] == "true":
        print("Maintenance mode active — exiting.")
        return

    # Fetch all active triggers
    triggers = supabase.table("triggers").select("*").eq("is_active", True).execute().data

    # Group by ticker — ONE Polygon.io API call for all tickers
    tickers = list({t["ticker"] for t in triggers})
    prices = await batch_fetch_prices(tickers)  # single API call

    now = datetime.now(timezone.utc)

    for trigger in triggers:
        price = prices.get(trigger["ticker"])
        if price is None:
            continue

        hit = (
            (trigger["condition"] == "above" and price >= trigger["target_price"]) or
            (trigger["condition"] == "below" and price <= trigger["target_price"])
        )
        if not hit:
            continue

        # Cooldown check (only for stay-armed triggers)
        if not trigger["auto_disarm"] and trigger["last_triggered_at"]:
            last = datetime.fromisoformat(trigger["last_triggered_at"])
            elapsed = (now - last).total_seconds() / 3600
            if elapsed < trigger["cooldown_hours"]:
                continue  # still in cooldown — skip

        await invoke_insight_agent(trigger, price, supabase)

        # Post-fire: deactivate or record timestamp
        if trigger["auto_disarm"]:
            supabase.table("triggers").update({
                "is_active": False,
                "last_triggered_at": now.isoformat()
            }).eq("id", trigger["id"]).execute()
        else:
            supabase.table("triggers").update({
                "last_triggered_at": now.isoformat()
            }).eq("id", trigger["id"]).execute()

asyncio.run(main())
```

### Kill Switch

Flip `maintenance_mode` to `'true'` in the Supabase dashboard to halt all agentic workers instantly — no redeploy needed.

---

## 12. Phase 7 — DevOps & GRC Hardening

**Goal:** Automate deployments and verify the app is secure.

### Deployment Security Matrix

| Layer | Service | Security Control |
|---|---|---|
| Frontend | Vercel | HTTPS enforced, Content Security Policy headers |
| Backend | Render | Environment variable encryption, no secrets in git |
| Auth | Supabase Auth | MFA supported, JWT short-lived tokens |
| Storage | Supabase | Row Level Security, Point-in-Time Recovery |
| Worker secrets | GitHub Actions secrets | Encrypted at rest, not logged |

### CI/CD Pipeline

```yaml
# infra/.github/workflows/ci.yml
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - run: pip install -r server/requirements.txt
      - run: ruff check server/ worker/           # linting gate
      - run: pytest server/tests/ --cov           # tests
      - run: pip install pip-audit && pip-audit -r server/requirements.txt  # CVE scan

      - run: pnpm install
      - run: pnpm prettier --check client/        # formatting gate
      - run: pnpm tsc --noEmit                    # type check
      - run: pnpm test --run                      # tests
      - run: pnpm audit --audit-level=high        # CVE scan
```

Tests, linting, and dependency scans must all pass before any merge to `main`.

**GitHub secret scanning:** Enable in repository Settings → Security → Secret scanning. GitHub automatically scans every push for API keys, tokens, and credentials matching known patterns and blocks them before they enter the repo history. Free for all repos.

### OWASP ZAP Self-Audit (Phase 2)

```bash
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://your-api.render.com
```

Run this periodically against the staging API to catch XSS, injection, and insecure headers.

---

## 13. Implementation Flow

| Step | Data Source | Logic | Output |
|---|---|---|---|
| 1. Monitor | Polygon.io | Compare ticker price vs. Trigger table | Boolean (hit or not) |
| 2. Context | Supabase (decrypted in memory) | Fetch + decrypt user notes for ticker | Plaintext notes |
| 3. Research | NewsAPI / Finnhub | Fetch top 5 headlines for ticker | News snippets |
| 4. Reason | Gemini 2.0 Flash | Synthesize notes + news + trigger context | Email summary draft |
| 5. Audit | Supabase | Write trace to `agent_audit_logs` | Immutable record |
| 6. Deliver | Resend | Send email to user | Notification in inbox |

---

## 14. Additional Considerations

### A. Testing Strategy

- **Unit tests:** `pytest` for FastAPI routes and `server/app/crypto/` utilities; `vitest` for React components
- **Integration tests:** Hit a real Supabase test project — do not mock the database (mock/real divergence is exactly the class of bug shared schemas prevent)
- **Worker tests:** Run `trigger_worker.py` against a test Supabase project with seed data to verify end-to-end trigger detection
- **CI gate:** All tests pass before merge to `main` or any deploy

### B. Error Handling & Resilience

- **Retry logic:** Use `tenacity` with exponential backoff on all Polygon.io and news API calls in the worker
- **Error logging:** Failed trigger checks write a row to a `trigger_errors` table (ticker, error message, timestamp) — queryable from Supabase dashboard
- **Sentry:** Captures uncaught exceptions in both the FastAPI app and the GitHub Actions worker script
- **Frontend:** React error boundaries prevent a broken widget from crashing the whole page

### C. Local Development Environment

- **`infra/docker-compose.yml`:** Runs FastAPI locally; use `supabase start` for a local Postgres instance
- **`.env.example`:** Committed with placeholder values — the definitive list of required secrets
- **`Makefile`:**
  ```makefile
  dev:
      supabase start && docker-compose up --build

  test:
      pytest server/tests/ && pnpm --filter client test

  migrate:
      alembic upgrade head

  worker:
      python worker/trigger_worker.py
  ```

### D. Database Migrations

- **Alembic** manages all schema changes — migration files committed to `infra/migrations/`
- Never run `CREATE TABLE` or `ALTER TABLE` manually in production
- The CI pipeline runs `alembic upgrade head` before tests to verify migrations are valid

### E. Frontend Architecture

- **TanStack Query:** All API calls — handles caching, background refetch, loading/error states
- **Zustand:** Lightweight client state (active ticker, modal state, notification count)
- **Real-time prices (Phase 2):** Server-Sent Events from a FastAPI `/api/stock/stream` endpoint

### F. Encryption Key Lifecycle

```python
# server/app/crypto/keys.py
import hmac, hashlib

def derive_key(master_key: bytes, user_id: str) -> bytes:
    # Per-user key derived deterministically — never stored anywhere
    return hmac.new(master_key, user_id.encode(), hashlib.sha256).digest()
```

- `MASTER_KEY` lives in Render's encrypted environment variables
- Per-user key exists only in memory during a request
- **Key rotation:** Generate new `MASTER_KEY` → migration script re-encrypts all notes → rotate secret in Render and GitHub Actions → invalidate active sessions

### G. Notification Delivery

- **MVP:** Resend email (free tier: 3,000/month) — one email per trigger hit with the AI summary
- **Phase 2:** Web push via VAPID (no third-party service) + in-app `notifications` table as fallback

### H. Data Privacy

- `DELETE /api/user/me` — cascade deletes all notes, triggers, audit logs, and the Supabase Auth record
- `GET /api/user/export` — decrypts and returns a full JSON archive of all user data
- The encryption guarantee: a full Supabase dump is meaningless without `MASTER_KEY` on the Render server. Document this in the README.

### I. Observability & Alerting

- **Sentry:** Exception tracking for FastAPI and React (free tier)
- **structlog:** Structured JSON logging in Python — ships to Render's log drain

```python
import structlog
log = structlog.get_logger()
log.info("trigger_check_complete", tickers=tickers, hits=len(hits), duration_ms=elapsed)
```

- **Alerts to configure:**
  - Gemini API quota approaching daily limit → email alert
  - GitHub Actions cron fails 3 times in a row → Sentry alert
  - Encryption error on any note → Sentry alert (indicates key mismatch — stop immediately)

---

## 15. Trigger UX & Advanced Settings

### Default Behavior (auto_disarm = true)

A trigger fires once and deactivates. The user sees it grayed out in the UI with a "Re-arm" button. This is the safe default — no risk of email spam, and the user is always in control.

### Advanced Settings Panel

An expandable "Advanced" section on the trigger creation/edit form with two options, each with an `ⓘ` tooltip:

```
[ ] Keep trigger armed after firing
    ⓘ By default, your trigger deactivates after it fires once and you
      must re-arm it manually. Enable this to keep it active and receive
      repeated alerts when the condition is met.

    Cooldown period: [4] hours
    ⓘ Minimum time between alerts for this trigger. Prevents repeated
      notifications if the price hovers near your target.
```

### UI State Machine for a Trigger

```
Created (is_active: true)
  → Condition met → Agent runs → Email sent
      → auto_disarm = true:  is_active flips false → "Fired — Re-arm?" shown in UI
      → auto_disarm = false:  last_triggered_at updated → stays green → cooldown timer shown
```

---

## 16. Worker Operational Considerations

### Market Hours Awareness

The worker should exit early outside NYSE market hours. Polygon.io free tier returns stale or null prices outside trading hours, which could produce false trigger hits or empty emails.

```python
# worker/trigger_worker.py
from datetime import datetime, time, timezone
import pytz

def is_market_open() -> bool:
    et = pytz.timezone("America/New_York")
    now = datetime.now(et)
    if now.weekday() >= 5:  # Saturday = 5, Sunday = 6
        return False
    return time(9, 30) <= now.time() <= time(16, 0)

if not is_market_open():
    print("Market closed — exiting.")
    sys.exit(0)
```

Add a list of NYSE market holidays as a static constant in the worker, or accept that the worker runs on holidays and exits cleanly with stale data.

### Empty Notes Handling

If a trigger fires for a ticker the user has never written about, `get_user_notes` returns an empty list. The agent must handle this explicitly.

Add to the system prompt:
```
If the user has no notes for this ticker, state that clearly and base
the summary only on current market news. Do not invent or infer user intent.
```

Also check in the worker before invoking the agent:

```python
notes = get_user_notes(ticker, user_id)
if not notes:
    # Still send email — news-only summary, clearly labeled
    summary = await get_news_only_summary(ticker)
else:
    summary = await insight_agent.run(notes=notes, news=news, trigger=trigger)
```

### Token Limit Strategy

For MVP, pass the 5 most recent notes per ticker:

```python
rows = await db.fetch("""
    SELECT encrypted_content FROM notes
    WHERE ticker = $1 AND user_id = $2
    ORDER BY created_at DESC
    LIMIT 5
""", ticker, user_id)
```

Document this limit. If a user asks why older notes aren't reflected, it's a known constraint, not a bug. Phase 2 can add summarization of older notes.

### Supabase Key Split

Two different Supabase keys with different privilege levels — using the wrong one in the wrong place silently breaks security:

| Context | Key | Why |
|---|---|---|
| FastAPI (user requests) | `SUPABASE_ANON_KEY` + user JWT | RLS enforces user isolation |
| GitHub Actions worker | `SUPABASE_SERVICE_KEY` | Needs to read all users' triggers — bypasses RLS intentionally |

Never use the service key in FastAPI. Never use the anon key in the worker.

### Monitoring the Monitor

GitHub Actions emails you on the **first** cron failure only — subsequent silent failures go unnoticed.

- **Sentry** (already in the plan) catches every uncaught exception in the worker script.
- The worker writes a `last_run_at` timestamp to `system_config` on every successful completion. Add a weekly sanity check: if `last_run_at` is more than 20 minutes old during market hours, something is wrong.
- Add a GitHub Actions status badge to the README so you can see at a glance if the last run succeeded.

```markdown
![Trigger Worker](https://github.com/your-username/trader-notebook/actions/workflows/cron-triggers.yml/badge.svg)
```

### "Not Financial Advice" Disclaimer

Every Resend email must include a footer:

```
---
This summary was generated automatically based on your notes and current news headlines.
It is not financial advice. Verify all information before making any decisions.
```

This sets the right mental model and is non-negotiable even for a personal app.

### Rollback Procedure

Both Render and Vercel support instant rollback — know where the button is before you need it.

- **Render:** Dashboard → your service → Deploys tab → click any previous deploy → "Rollback to this deploy"
- **Vercel:** Dashboard → your project → Deployments → click any previous deploy → "Promote to Production"

Both take under 60 seconds and require no code change.

### MASTER_KEY Backup

If `MASTER_KEY` is lost, every note in the database is permanently unreadable — there is no recovery path. Before encrypting a single note in production:

1. Generate the key: `python -c "import secrets; print(secrets.token_hex(32))"`
2. Store it in Render environment variables
3. Store it in GitHub Actions secrets
4. Store a copy in a password manager (1Password, Bitwarden)
5. Optionally: write it on paper and store it physically

This is a five-minute task. Do it before the first production note is written.
