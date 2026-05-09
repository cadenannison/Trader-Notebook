from app.skills.news import get_market_news
from app.skills.notes import get_user_notes


async def run_insight_agent(
    ticker: str,
    user_id: str,
    trigger_price: float,
    condition: str,
) -> str:
    """Orchestrate the insight agent for a triggered price alert.

    TODO: replace with Pydantic AI + Gemini 2.0 Flash:
        from pydantic_ai import Agent
        from pydantic_ai.models.gemini import GeminiModel

        agent = Agent(
            model=GeminiModel("gemini-2.0-flash"),
            system_prompt=FINANCIAL_AUDITOR_PROMPT,
        )
        result = await agent.run(prompt)
        return result.data

    Phase 2: swap model for "claude-sonnet-4-6" and add result_type=InsightOutput
    for structured JSON output.
    """
    notes = await get_user_notes(ticker, user_id)
    news = await get_market_news(ticker)

    direction = "risen above" if condition == "above" else "fallen below"
    notes_text = " ".join(notes[:3])
    news_text = " ".join(news[:3])

    return (
        f"{ticker} has {direction} your target of ${trigger_price:.2f}. "
        f"Your notes suggest: {notes_text[:120]}. "
        f"Current market news: {news_text[:120]}. "
        f"This appears consistent with the thesis you outlined — worth reviewing your position."
    )
