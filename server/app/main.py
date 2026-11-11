import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api import (
    admin,
    auth_lookup,
    briefing,
    chat,
    insights,
    journal_notes,
    news,
    notes,
    portfolios,
    stock,
    trades,
    triggers,
    user,
    watchlist,
)
from app.config import settings
from app.crypto.keys import master_key_is_valid

_logger = logging.getLogger(__name__)

# A malformed MASTER_KEY doesn't fail until the first note read/write, where it
# surfaces as an opaque 500 ("error fetching notes" in chat). Surface it loudly
# at boot instead — this is the single most likely deploy misconfiguration.
if settings.supabase_url and not master_key_is_valid(settings.master_key):
    _logger.error(
        "MASTER_KEY is not a 64-character hex string — all journal note reads and "
        "writes will fail. Set it with `openssl rand -hex 32`."
    )

# Sentry — init before any request handling
if settings.sentry_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        integrations=[StarletteIntegration(), FastApiIntegration()],
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="tradrNotebook API", version="0.1.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


def _build_cors_origins() -> list[str]:
    origins = []
    if settings.client_url:
        origins.append(settings.client_url.rstrip("/"))
    return origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=_build_cors_origins(),
    # Scoped to this project's own Vercel deployments only (project slug
    # "trader-notebook" per .vercel/repo.json) — matches production
    # (trader-notebook.vercel.app) and preview/branch deployments
    # (trader-notebook-<hash>.vercel.app, trader-notebook-git-<branch>-<team>.vercel.app),
    # not any arbitrary *.vercel.app origin, since allow_credentials=True
    # makes an overly broad regex here a credentialed-CORS risk.
    allow_origin_regex=r"https?://localhost(:\d+)?|https://trader-notebook(-[a-zA-Z0-9]+)*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_lookup.router, prefix="/api")
app.include_router(stock.router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(triggers.router, prefix="/api")
app.include_router(user.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(news.router, prefix="/api")
app.include_router(watchlist.router, prefix="/api")
app.include_router(trades.router, prefix="/api")
app.include_router(briefing.router, prefix="/api")
app.include_router(portfolios.router, prefix="/api")
app.include_router(journal_notes.router, prefix="/api")
app.include_router(insights.router, prefix="/api")
app.include_router(admin.router, prefix="/api")


@app.get("/api/health")
async def health():
    configured = {
        "supabase": bool(settings.supabase_url),
        "polygon": bool(settings.polygon_api_key),
        "finnhub": bool(settings.finnhub_api_key),
        "gemini": bool(settings.gemini_api_key),
        "resend": bool(settings.resend_api_key),
    }
    return {"status": "ok", "version": "0.1.0", "configured": configured}
