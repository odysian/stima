"""Shared fixtures for core module unit tests."""

import pytest
from app.core.config import get_settings
from app.core.database import get_engine, get_session_maker


@pytest.fixture(autouse=True)
def _configure_required_settings(monkeypatch):
    """Provide required auth settings for isolated unit tests."""
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-that-is-at-least-32-bytes")
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_maker.cache_clear()
    yield
    get_session_maker.cache_clear()
    get_engine.cache_clear()
    get_settings.cache_clear()
