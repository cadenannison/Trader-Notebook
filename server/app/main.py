import re

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api import briefing, chat, news, notes, stock, trades, triggers, user, watchlist
from app.config import settings

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="tradrNotebook API", version="0.1.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_ORIGIN_RE = re.compile(r"^https?://localhost(:\d+)?$")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://localhost(:\d+)?",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(stock.router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(triggers.router, prefix="/api")
app.include_router(user.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(news.router, prefix="/api")
app.include_router(watchlist.router, prefix="/api")
app.include_router(trades.router, prefix="/api")
app.include_router(briefing.router, prefix="/api")


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
