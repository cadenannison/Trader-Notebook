import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import settings
from app.middleware.auth import get_current_user

router = APIRouter()


class TagStat(BaseModel):
    tag: str
    total: int
    wins: int
    avg_return: float


class InsightsSummary(BaseModel):
    total_trades: int
    open_trades: int
    win_rate: float
    avg_return: float
    best_trade_pct: float | None
    worst_trade_pct: float | None
    best_trade_ticker: str | None
    worst_trade_ticker: str | None


class InsightsResponse(BaseModel):
    summary: InsightsSummary
    by_confidence_tag: list[TagStat]
    by_exit_reason: list[TagStat]
    by_time_horizon: list[TagStat]
    coaching_insights: list[str]


def _group_by(trades: list[dict], field: str) -> list[TagStat]:
    groups: dict[str, dict] = {}
    for t in trades:
        key = t.get(field) or "unknown"
        if key not in groups:
            groups[key] = {"total": 0, "wins": 0, "returns": []}
        groups[key]["total"] += 1
        rp = t.get("return_pct")
        if rp is not None:
            if rp > 0:
                groups[key]["wins"] += 1
            groups[key]["returns"].append(rp)
    result = []
    for tag, g in groups.items():
        avg = sum(g["returns"]) / len(g["returns"]) if g["returns"] else 0.0
        result.append(TagStat(tag=tag, total=g["total"], wins=g["wins"], avg_return=round(avg, 2)))
    return sorted(result, key=lambda x: x.total, reverse=True)


async def _gemini_insights(
    summary: InsightsSummary, by_confidence: list[TagStat], by_exit: list[TagStat]
) -> list[str]:
    if not settings.gemini_api_key or summary.total_trades == 0:
        return []
    context = {
        "total_closed_trades": summary.total_trades,
        "win_rate_pct": round(summary.win_rate, 1),
        "avg_return_pct": round(summary.avg_return, 2),
        "best_trade": f"{summary.best_trade_ticker} +{summary.best_trade_pct:.1f}%"
        if summary.best_trade_pct
        else None,
        "worst_trade": f"{summary.worst_trade_ticker} {summary.worst_trade_pct:.1f}%"
        if summary.worst_trade_pct
        else None,
        "by_confidence": [c.model_dump() for c in by_confidence],
        "by_exit_reason": [e.model_dump() for e in by_exit],
    }
    prompt = (
        "You are a trading coach reviewing a personal trader's performance data. "
        "Based on these aggregated stats, write exactly 3 short coaching insights (1–2 sentences each). "
        "Be honest, specific, and constructive. Never give financial advice. "
        "Return a JSON array of strings, nothing else.\n\n"
        f"Stats: {context}"
    )
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key={settings.gemini_api_key}",
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"responseMimeType": "application/json"},
                },
            )
        if r.status_code != 200:
            return []
        import json

        raw = r.json()["candidates"][0]["content"]["parts"][0]["text"]
        insights = json.loads(raw)
        return insights if isinstance(insights, list) else []
    except Exception:
        return []


@router.get("/insights", response_model=InsightsResponse)
async def get_insights(user_id: str = Depends(get_current_user)):
    # Dev / no-Supabase fallback
    if not settings.supabase_url:
        return InsightsResponse(
            summary=InsightsSummary(
                total_trades=0,
                open_trades=0,
                win_rate=0,
                avg_return=0,
                best_trade_pct=None,
                worst_trade_pct=None,
                best_trade_ticker=None,
                worst_trade_ticker=None,
            ),
            by_confidence_tag=[],
            by_exit_reason=[],
            by_time_horizon=[],
            coaching_insights=["Log some trades to unlock pattern insights."],
        )

    from supabase import create_client

    sb = create_client(settings.supabase_url, settings.supabase_service_key)

    all_trades = sb.table("trades").select("*").eq("user_id", user_id).execute().data or []
    closed = [
        t for t in all_trades if t.get("status") == "closed" and t.get("return_pct") is not None
    ]
    open_trades = [t for t in all_trades if t.get("status") == "open"]

    wins = [t for t in closed if (t.get("return_pct") or 0) > 0]
    returns = [t["return_pct"] for t in closed if t.get("return_pct") is not None]
    avg_return = sum(returns) / len(returns) if returns else 0.0
    win_rate = (len(wins) / len(closed) * 100) if closed else 0.0

    best = max(closed, key=lambda t: t.get("return_pct") or 0, default=None)
    worst = min(closed, key=lambda t: t.get("return_pct") or 0, default=None)

    summary = InsightsSummary(
        total_trades=len(closed),
        open_trades=len(open_trades),
        win_rate=round(win_rate, 1),
        avg_return=round(avg_return, 2),
        best_trade_pct=round(best["return_pct"], 2) if best else None,
        worst_trade_pct=round(worst["return_pct"], 2) if worst else None,
        best_trade_ticker=best["ticker"] if best else None,
        worst_trade_ticker=worst["ticker"] if worst else None,
    )

    by_confidence = _group_by(closed, "confidence_tag")
    by_exit = _group_by(closed, "exit_reason")
    by_horizon = _group_by(closed, "time_horizon")

    coaching = await _gemini_insights(summary, by_confidence, by_exit)

    return InsightsResponse(
        summary=summary,
        by_confidence_tag=by_confidence,
        by_exit_reason=by_exit,
        by_time_horizon=by_horizon,
        coaching_insights=coaching,
    )
