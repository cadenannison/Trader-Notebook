async def get_market_news(ticker: str) -> list[str]:
    """Fetch current news headlines for a ticker.

    TODO:
        response = await httpx.get(
            "https://newsapi.org/v2/everything",
            params={"q": ticker, "pageSize": 5, "sortBy": "publishedAt"},
            headers={"X-Api-Key": settings.newsapi_key},
        )
        articles = response.json()["articles"]
        return [f"{a['title']} — {a['description']}" for a in articles]
    """
    return [
        f"[MOCK] {ticker} hits record high amid continued AI infrastructure buildout",
        f"[MOCK] Analysts raise {ticker} price target citing strong data center demand",
        f"[MOCK] {ticker} supply chain concerns emerge ahead of earnings",
    ]
