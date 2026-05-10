import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture(autouse=True)
def _clear_credentials():
    """Reset real credentials for every test so tests run against mock data.
    Tests that need specific settings (e.g. auth tests) patch explicitly on top of this."""
    with patch.multiple(
        settings,
        supabase_url="",
        supabase_service_key="",
        supabase_jwt_secret="",
        supabase_anon_key="",
    ):
        yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
