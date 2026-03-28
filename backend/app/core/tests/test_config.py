"""Settings tests for auth and cookie configuration."""

from collections.abc import Iterator

import pytest
from app.core.config import Settings, get_database_url, get_settings
from pydantic import ValidationError


@pytest.fixture(autouse=True)
def _required_settings(monkeypatch) -> Iterator[None]:
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-that-is-at-least-32-bytes")
    monkeypatch.setenv("GCS_BUCKET_NAME", "stima-test-logos")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_cookie_domain_blank_is_normalized(monkeypatch) -> None:
    monkeypatch.setenv("COOKIE_DOMAIN", "")

    settings = get_settings()

    assert settings.cookie_domain is None


def test_optional_sentry_and_admin_config_blank_values_are_normalized(monkeypatch) -> None:
    monkeypatch.setenv("SENTRY_DSN", "   ")
    monkeypatch.setenv("ADMIN_API_KEY", "")

    settings = get_settings()

    assert settings.sentry_dsn is None
    assert settings.admin_api_key is None


def test_allowed_origins_csv_parses_to_list(monkeypatch) -> None:
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:5173, https://app.stima.dev")

    settings = get_settings()

    assert settings.allowed_origins == [
        "http://localhost:5173",
        "https://app.stima.dev",
    ]


def test_secret_key_must_be_non_empty(monkeypatch) -> None:
    monkeypatch.setenv("SECRET_KEY", "")

    with pytest.raises(ValidationError):
        get_settings()


def test_secret_key_must_be_at_least_32_characters(monkeypatch) -> None:
    monkeypatch.setenv("SECRET_KEY", "short-secret")

    with pytest.raises(ValidationError):
        get_settings()


def test_secret_key_rejects_known_placeholder_values(monkeypatch) -> None:
    monkeypatch.setenv("SECRET_KEY", "replace-with-strong-random-value")

    with pytest.raises(ValidationError):
        get_settings()


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

    with pytest.raises(ValidationError):
        get_settings()


def test_gcs_bucket_name_is_required(monkeypatch) -> None:
    monkeypatch.delenv("GCS_BUCKET_NAME", raising=False)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)  # type: ignore[call-arg]
