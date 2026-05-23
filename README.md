# tradrNotebook

AI-powered trading journal. Log trades, track your watchlist, set price alerts, and get coaching insights from your own data.

**Stack:** Next.js 14 · FastAPI · Supabase · Gemini · Render · Vercel

---

## Prerequisites

- Python 3.13
- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)

---

## Local setup

```bash
git clone https://github.com/your-username/Trader-Notebook.git
cd Trader-Notebook

# Create the virtual environment, install all dependencies, and wire up pre-commit hooks
make install
```

### Configure environment variables

```bash
# Backend
cp server/.env.example server/.env

# Frontend
cp client/.env.local.example client/.env.local
```

(Polygon, Finnhub, Gemini, Resend) is optional — the app runs in dev mode without them.

## Running locally

```bash
make dev
```

- Backend: [http://localhost:8000](http://localhost:8000)
- Frontend: [http://localhost:3000](http://localhost:3000)
- API health: [http://localhost:8000/api/health](http://localhost:8000/api/health)

---

## Common commands

```bash
make test      # Run server (pytest) and client (vitest) test suites
make lint      # Ruff lint check across server/ and worker/
make worker    # Run the trigger worker locally
```

---

## Deployment

| Service | What it runs |
|---|---|
| [Vercel](https://vercel.com) | Next.js frontend (auto-deploys from `main`) |
| [Render](https://render.com) | FastAPI backend (auto-deploys via `render.yaml`) |
| GitHub Actions | CI on every push · scheduled price alert worker |
