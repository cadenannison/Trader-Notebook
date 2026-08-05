"""
User API tests.

Runs against the in-memory mock (no Supabase configured).
Verifies API contract for export and account deletion.
"""

from unittest.mock import MagicMock, patch

from app.config import settings
from app.crypto.keys import derive_key, encrypt
from app.main import app
from app.middleware.auth import get_current_user


class _FakeTable:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def execute(self):
        result = MagicMock()
        result.data = self._rows
        return result


class _FakeSupabaseClient:
    """Minimal stand-in for the supabase-py client's query builder chain."""

    def __init__(self, tables: dict[str, list[dict]]):
        self._tables = tables

    def table(self, name):
        return _FakeTable(self._tables.get(name, []))


def test_export_returns_200(client):
    resp = client.get("/api/user/export")
    assert resp.status_code == 200


def test_export_response_shape(client):
    data = client.get("/api/user/export").json()
    assert "user_id" in data
    assert "exported_at" in data
    assert "notes" in data
    assert "triggers" in data
    assert "trades" in data
    assert "watchlist" in data
    assert "portfolios" in data
    assert "journal_notes" in data


def test_export_empty_state_returns_empty_lists(client):
    data = client.get("/api/user/export").json()
    assert data["notes"] == []
    assert data["triggers"] == []
    assert data["trades"] == []
    assert data["watchlist"] == []
    assert data["portfolios"] == []
    assert data["journal_notes"] == []


def test_delete_account_returns_204(client):
    resp = client.delete("/api/user/me")
    assert resp.status_code == 204


# ── Regression: export must actually decrypt note content ────────────────────
#
# `encrypted_content` is stored as a hex string everywhere in this codebase
# (every writer does `.hex()`, every other reader does `bytes.fromhex(...)`).
# export_user_data used to call `bytes(n["encrypted_content"])` directly on
# that hex string, which raises TypeError — silently swallowed by a bare
# except, so every export returned "[decryption failed]" for every note.


def test_export_decrypts_notes_and_journal_notes_correctly(client):
    user_id = "test-export-user"
    key = derive_key(settings.master_key, user_id)

    note_plaintext = "Watching for a breakout above $195."
    journal_plaintext = "Entered confident, thesis was earnings acceleration."

    fake_tables = {
        "notes": [
            {
                "id": "note-1",
                "ticker": "AAPL",
                "encrypted_content": encrypt(note_plaintext, key).hex(),
                "created_at": "2026-05-10T00:00:00Z",
            }
        ],
        "journal_notes": [
            {
                "id": "jnote-1",
                "title": "AAPL thesis",
                "encrypted_content": encrypt(journal_plaintext, key).hex(),
                "tags": ["AAPL"],
                "created_at": "2026-05-10T00:00:00Z",
                "updated_at": "2026-05-10T00:00:00Z",
            }
        ],
        "triggers": [],
        "trades": [],
        "watchlist_entries": [],
        "portfolios": [],
    }

    app.dependency_overrides[get_current_user] = lambda: user_id
    try:
        with (
            patch.object(settings, "supabase_url", "https://fake.supabase.co"),
            patch.object(settings, "supabase_service_key", "fake-service-key"),
            patch("supabase.create_client", return_value=_FakeSupabaseClient(fake_tables)),
        ):
            data = client.get("/api/user/export").json()
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert data["notes"][0]["content"] == note_plaintext
    assert data["journal_notes"][0]["content"] == journal_plaintext
    assert "[decryption failed]" not in str(data)
