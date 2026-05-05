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


def test_redis_key_prefix_is_normalized(monkeypatch) -> None:
    monkeypatch.setenv("REDIS_KEY_PREFIX", " custom-prefix: ")

    settings = get_settings()

    assert settings.redis_key_prefix == "custom-prefix"


def test_redis_key_prefix_must_be_non_empty(monkeypatch) -> None:
    monkeypatch.setenv("REDIS_KEY_PREFIX", "  :  ")

    with pytest.raises(ValidationError, match="REDIS_KEY_PREFIX must be non-empty"):
        get_settings()


def test_worker_concurrency_defaults_to_ten() -> None:
    settings = get_settings()

    assert settings.worker_concurrency == 10


def test_worker_concurrency_must_be_positive(monkeypatch) -> None:
    monkeypatch.setenv("WORKER_CONCURRENCY", "0")

    with pytest.raises(ValidationError, match="WORKER_CONCURRENCY must be at least 1"):
        get_settings()


def test_extraction_job_reaper_settings_use_expected_defaults() -> None:
    settings = get_settings()

    assert settings.extraction_job_reaper_interval_seconds == 120
    assert settings.extraction_job_stale_ttl_seconds == 300


def test_extraction_job_reaper_settings_must_be_positive(monkeypatch) -> None:
    monkeypatch.setenv("EXTRACTION_JOB_REAPER_INTERVAL_SECONDS", "0")

    with pytest.raises(
        ValidationError,
        match="Extraction job reaper timing values must be at least 1 second",
    ):
        get_settings()


@pytest.mark.parametrize(
    "setting_name",
    [
        "QUOTE_EMAIL_DUPLICATE_SEND_WINDOW_SECONDS",
        "INVOICE_EMAIL_DUPLICATE_SEND_WINDOW_SECONDS",
    ],
)
def test_duplicate_send_window_seconds_must_be_positive(monkeypatch, setting_name: str) -> None:
    monkeypatch.setenv(setting_name, "0")

    with pytest.raises(ValidationError):
        get_settings()


def test_allowed_origins_csv_parses_to_list(monkeypatch) -> None:
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:5173, https://app.stima.dev")

    settings = get_settings()

    assert settings.allowed_origins == [
        "http://localhost:5173",
        "https://app.stima.dev",
    ]


def test_allowed_hosts_csv_parses_to_list(monkeypatch) -> None:
    monkeypatch.setenv("ALLOWED_HOSTS", "api.stima.dev, 127.0.0.1")

    settings = get_settings()

    assert settings.allowed_hosts == ["api.stima.dev", "127.0.0.1"]


def test_frontend_url_is_normalized_without_trailing_slash(monkeypatch) -> None:
    monkeypatch.setenv("FRONTEND_URL", "https://app.stima.dev/")

    settings = get_settings()

    assert settings.frontend_url == "https://app.stima.dev"


def test_frontend_url_must_be_absolute_http_url(monkeypatch) -> None:
    monkeypatch.setenv("FRONTEND_URL", "app.stima.dev")

    with pytest.raises(ValidationError):
        get_settings()


def test_email_delivery_config_blank_values_are_normalized(monkeypatch) -> None:
    monkeypatch.setenv("RESEND_API_KEY", " ")
    monkeypatch.setenv("EMAIL_FROM_ADDRESS", "")
    monkeypatch.setenv("EMAIL_FROM_NAME", "   ")

    settings = get_settings()

    assert settings.resend_api_key is None
    assert settings.email_from_address is None
    assert settings.email_from_name is None


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


def _set_production_safe_defaults(monkeypatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("COOKIE_HTTPONLY", "true")
    monkeypatch.setenv("FRONTEND_URL", "https://app.stima.dev")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://app.stima.dev")
    monkeypatch.setenv("ALLOWED_HOSTS", "api.stima.dev")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("ALLOW_REDIS_DEGRADED_MODE", "false")


@pytest.mark.parametrize("wildcard_origin", ["*", "http://*", "https://*"])
def test_production_rejects_wildcard_allowed_origins(monkeypatch, wildcard_origin: str) -> None:
    _set_production_safe_defaults(monkeypatch)
    monkeypatch.setenv("ALLOWED_ORIGINS", wildcard_origin)

    with pytest.raises(
        ValidationError,
        match="ALLOWED_ORIGINS must not contain wildcard values",
    ):
        get_settings()


def test_production_allows_explicit_https_allowed_origins(monkeypatch) -> None:
    _set_production_safe_defaults(monkeypatch)
    monkeypatch.setenv(
        "ALLOWED_ORIGINS",
        "https://stima.example.com,https://www.stima.example.com",
    )

    settings = get_settings()

    assert settings.allowed_origins == [
        "https://stima.example.com",
        "https://www.stima.example.com",
    ]


def test_production_rejects_non_https_allowed_origins(monkeypatch) -> None:
    _set_production_safe_defaults(monkeypatch)
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://stima.example.com")

    with pytest.raises(
        ValidationError,
        match="ALLOWED_ORIGINS entries must be explicit https origins",
    ):
        get_settings()


def test_production_rejects_cookie_httponly_false(monkeypatch) -> None:
    _set_production_safe_defaults(monkeypatch)
    monkeypatch.setenv("COOKIE_HTTPONLY", "false")

    with pytest.raises(ValidationError, match="COOKIE_HTTPONLY must be true"):
        get_settings()


def test_production_rejects_empty_allowed_origins(monkeypatch) -> None:
    _set_production_safe_defaults(monkeypatch)
    monkeypatch.setenv("ALLOWED_ORIGINS", "")

    with pytest.raises(
        ValidationError,
        match="ALLOWED_ORIGINS must be non-empty",
    ):
        get_settings()


def test_production_rejects_localhost_allowed_origins(monkeypatch) -> None:
    _set_production_safe_defaults(monkeypatch)
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:5173")

    with pytest.raises(
        ValidationError,
        match="ALLOWED_ORIGINS entries must be explicit https origins",
    ):
        get_settings()


def test_production_requires_secure_cookies(monkeypatch) -> None:
    _set_production_safe_defaults(monkeypatch)
    monkeypatch.setenv("COOKIE_SECURE", "false")

    with pytest.raises(ValidationError):
        get_settings()


def test_production_requires_non_localhost_frontend_url(monkeypatch) -> None:
    _set_production_safe_defaults(monkeypatch)
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:5173")

    with pytest.raises(ValidationError):
        get_settings()


def test_production_rejects_ipv6_loopback_frontend_url(monkeypatch) -> None:
    _set_production_safe_defaults(monkeypatch)
    monkeypatch.setenv("FRONTEND_URL", "http://[::1]:5173")

    with pytest.raises(ValidationError):
        get_settings()


def test_production_requires_allowed_hosts(monkeypatch) -> None:
    _set_production_safe_defaults(monkeypatch)
    monkeypatch.delenv("ALLOWED_HOSTS", raising=False)

    with pytest.raises(ValidationError):
        get_settings()


def test_production_rejects_wildcard_allowed_hosts(monkeypatch) -> None:
    _set_production_safe_defaults(monkeypatch)
    monkeypatch.setenv("ALLOWED_HOSTS", "*")

    with pytest.raises(ValidationError):
        get_settings()


def test_production_requires_redis_url(monkeypatch) -> None:
    _set_production_safe_defaults(monkeypatch)
    monkeypatch.setenv("REDIS_URL", "")

    with pytest.raises(ValidationError, match="REDIS_URL must be set"):
        get_settings()


def test_production_rejects_redis_degraded_mode(monkeypatch) -> None:
    _set_production_safe_defaults(monkeypatch)
    monkeypatch.setenv("ALLOW_REDIS_DEGRADED_MODE", "true")

    with pytest.raises(
        ValidationError,
        match="ALLOW_REDIS_DEGRADED_MODE must be false",
    ):
        get_settings()


@pytest.mark.parametrize(
    "admin_key",
    [
        "admin",
        "changeme",
        "change-me",
        "dev",
        "development",
        "test",
        "secret",
        "password",
    ],
)
def test_production_rejects_placeholder_admin_api_key(monkeypatch, admin_key: str) -> None:
    _set_production_safe_defaults(monkeypatch)
    monkeypatch.setenv("ADMIN_API_KEY", admin_key)

    with pytest.raises(
        ValidationError,
        match="ADMIN_API_KEY cannot use placeholder/dev values",
    ):
        get_settings()


def test_production_rejects_short_admin_api_key(monkeypatch) -> None:
    _set_production_safe_defaults(monkeypatch)
    monkeypatch.setenv("ADMIN_API_KEY", "a" * 31)

    with pytest.raises(
        ValidationError,
        match="ADMIN_API_KEY must be at least 32 characters",
    ):
        get_settings()


def test_production_allows_strong_admin_api_key(monkeypatch) -> None:
    _set_production_safe_defaults(monkeypatch)
    monkeypatch.setenv("ADMIN_API_KEY", "a" * 48)

    settings = get_settings()

    assert settings.admin_api_key == "a" * 48
