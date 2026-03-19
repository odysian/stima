"""Settings tests for auth and cookie configuration."""

import pytest
from pydantic import ValidationError

from app.core.config import get_database_url, get_settings


def test_cookie_domain_blank_is_normalized(monkeypatch) -> None:
    monkeypatch.setenv("COOKIE_DOMAIN", "")
    get_settings.cache_clear()

    settings = get_settings()

    assert settings.cookie_domain is None

    get_settings.cache_clear()


def test_allowed_origins_csv_parses_to_list(monkeypatch) -> None:
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:5173, https://app.stima.dev")
    get_settings.cache_clear()

    settings = get_settings()

    assert settings.allowed_origins == [
        "http://localhost:5173",
        "https://app.stima.dev",
    ]

    get_settings.cache_clear()


def test_secret_key_must_be_non_empty(monkeypatch) -> None:
    monkeypatch.setenv("SECRET_KEY", "")
    get_settings.cache_clear()

    with pytest.raises(ValidationError):
        get_settings()

    get_settings.cache_clear()


def test_get_database_url_resolves_without_secret_key(monkeypatch) -> None:
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://db-user:db-pass@localhost:5432/stima")

    db_url = get_database_url("postgresql+asyncpg://fallback:pass@localhost:5432/fallback")

    assert db_url == "postgresql+asyncpg://db-user:db-pass@localhost:5432/stima"


def test_get_database_url_uses_default_when_env_missing(monkeypatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)

    db_url = get_database_url("postgresql+asyncpg://fallback:pass@localhost:5432/fallback")

    assert db_url == "postgresql+asyncpg://fallback:pass@localhost:5432/fallback"


def test_cookie_samesite_none_requires_secure(monkeypatch) -> None:
    monkeypatch.setenv("COOKIE_SAMESITE", "none")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    get_settings.cache_clear()

    with pytest.raises(ValidationError):
        get_settings()

    get_settings.cache_clear()
