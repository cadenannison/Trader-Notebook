"""
CORS regex regression tests.

`allow_origin_regex` is combined with `allow_credentials=True` in main.py, so
it must be scoped to this project's own Vercel deployments (project slug
"trader-notebook") — not any arbitrary *.vercel.app origin, which would let
any throwaway Vercel-hosted project be treated as a trusted, credentialed
CORS origin.
"""


def test_cors_allows_this_projects_production_vercel_origin(client):
    resp = client.get("/api/health", headers={"Origin": "https://trader-notebook.vercel.app"})
    assert resp.headers.get("access-control-allow-origin") == "https://trader-notebook.vercel.app"


def test_cors_allows_this_projects_preview_vercel_origin(client):
    resp = client.get(
        "/api/health",
        headers={"Origin": "https://trader-notebook-git-main-caden.vercel.app"},
    )
    assert (
        resp.headers.get("access-control-allow-origin")
        == "https://trader-notebook-git-main-caden.vercel.app"
    )


def test_cors_rejects_unrelated_vercel_project_origin(client):
    resp = client.get(
        "/api/health",
        headers={"Origin": "https://some-random-attacker-project.vercel.app"},
    )
    assert "access-control-allow-origin" not in resp.headers


def test_cors_allows_localhost(client):
    resp = client.get("/api/health", headers={"Origin": "http://localhost:3000"})
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"
