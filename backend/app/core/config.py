"""Application settings for database, auth, cookie, and delivery behavior."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Annotated, Any, Literal
from urllib.parse import urlparse

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

MIN_SECRET_KEY_LENGTH = 32
LOCALHOST_HOSTS = frozenset({"localhost", "127.0.0.1", "0.0.0.0"})  # nosec B104
FORBIDDEN_SECRET_KEY_VALUES = frozenset(
    {
        "dev-secret-key-change-in-production",
        "changeme",
        "change-me",
        "replace-me",
        "replace-with-strong-random-value",
        "your-secret-key",
    }
)


class Settings(BaseSettings):
    """Environment-backed runtime settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    database_url: str = Field(
        default="postgresql+asyncpg://stima:stima@localhost:5432/stima",
        validation_alias="DATABASE_URL",
    )
    secret_key: str = Field(
        default="",
        validation_alias="SECRET_KEY",
        validate_default=True,
    )
    jwt_algorithm: str = Field(default="HS256", validation_alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(
        default=15,
        validation_alias="ACCESS_TOKEN_EXPIRE_MINUTES",
    )
    refresh_token_expire_days: int = Field(
        default=30,
        validation_alias="REFRESH_TOKEN_EXPIRE_DAYS",
    )

    cookie_secure: bool = Field(default=False, validation_alias="COOKIE_SECURE")
    cookie_httponly: bool = Field(default=True, validation_alias="COOKIE_HTTPONLY")
    cookie_samesite: Literal["lax", "strict", "none"] = Field(
        default="lax",
        validation_alias="COOKIE_SAMESITE",
    )
    cookie_domain: str | None = Field(default=None, validation_alias="COOKIE_DOMAIN")

    environment: str = Field(default="development", validation_alias="ENVIRONMENT")
    sentry_dsn: str | None = Field(default=None, validation_alias="SENTRY_DSN")
    admin_api_key: str | None = Field(default=None, validation_alias="ADMIN_API_KEY")
    frontend_url: str = Field(
        default="http://localhost:5173",
        validation_alias="FRONTEND_URL",
    )
    resend_api_key: str | None = Field(default=None, validation_alias="RESEND_API_KEY")
    email_from_address: str | None = Field(
        default=None,
        validation_alias="EMAIL_FROM_ADDRESS",
    )
    email_from_name: str | None = Field(default=None, validation_alias="EMAIL_FROM_NAME")
    anthropic_api_key: str = Field(
        default="",
        validation_alias="ANTHROPIC_API_KEY",
    )
    openai_api_key: str = Field(
        default="",
        validation_alias="OPENAI_API_KEY",
    )
    extraction_model: str = Field(
        default="claude-haiku-4-5-20251001",
        validation_alias="EXTRACTION_MODEL",
    )
    transcription_model: str = Field(
        default="whisper-1",
        validation_alias="TRANSCRIPTION_MODEL",
    )
    allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"],
        validation_alias="ALLOWED_ORIGINS",
    )
    allowed_hosts: Annotated[list[str], NoDecode] = Field(
        default_factory=list,
        validation_alias="ALLOWED_HOSTS",
    )
    enable_https_redirect: bool = Field(
        default=False,
        validation_alias="ENABLE_HTTPS_REDIRECT",
    )
    trusted_proxy_ips: Annotated[list[str], NoDecode] = Field(
        default_factory=list,
        validation_alias="TRUSTED_PROXY_IPS",
    )
    gcs_bucket_name: str = Field(
        default="",
        validation_alias="GCS_BUCKET_NAME",
        validate_default=True,
    )

    @field_validator("cookie_domain", mode="before")
    @classmethod
    def normalize_cookie_domain(cls, value: Any) -> str | None:
        """Treat empty cookie domain as unset."""
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return str(value)

    @field_validator(
        "sentry_dsn",
        "admin_api_key",
        "resend_api_key",
        "email_from_address",
        "email_from_name",
        mode="before",
    )
    @classmethod
    def normalize_optional_strings(cls, value: Any) -> str | None:
        """Treat empty optional config values as unset."""
        if value is None:
            return None
        if isinstance(value, str):
            normalized_value = value.strip()
            if not normalized_value:
                return None
            return normalized_value
        return str(value)

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, value: str) -> str:
        """Fail fast when SECRET_KEY is missing, weak, or clearly placeholder text."""
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("SECRET_KEY must be set and non-empty")
        if len(normalized_value) < MIN_SECRET_KEY_LENGTH:
            raise ValueError(f"SECRET_KEY must be at least {MIN_SECRET_KEY_LENGTH} characters")
        if normalized_value.lower() in FORBIDDEN_SECRET_KEY_VALUES:
            raise ValueError("SECRET_KEY cannot use placeholder/dev values")
        return normalized_value

    @field_validator("gcs_bucket_name")
    @classmethod
    def validate_gcs_bucket_name(cls, value: str) -> str:
        """Require a non-empty GCS bucket name for private asset storage."""
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("GCS_BUCKET_NAME must be set and non-empty")
        return normalized_value

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def normalize_allowed_origins(cls, value: Any) -> list[str]:
        """Allow ALLOWED_ORIGINS as CSV string or list."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        if isinstance(value, list):
            return [str(origin).strip() for origin in value if str(origin).strip()]
        return ["http://localhost:5173"]

    @field_validator("allowed_hosts", mode="before")
    @classmethod
    def normalize_allowed_hosts(cls, value: Any) -> list[str]:
        """Allow ALLOWED_HOSTS as CSV string or list."""
        if isinstance(value, str):
            return [host.strip() for host in value.split(",") if host.strip()]
        if isinstance(value, list):
            return [str(host).strip() for host in value if str(host).strip()]
        return []

    @field_validator("trusted_proxy_ips", mode="before")
    @classmethod
    def normalize_trusted_proxy_ips(cls, value: Any) -> list[str]:
        """Allow TRUSTED_PROXY_IPS as CSV string or list."""
        if isinstance(value, str):
            return [ip.strip() for ip in value.split(",") if ip.strip()]
        if isinstance(value, list):
            return [str(ip).strip() for ip in value if str(ip).strip()]
        return []

    @field_validator("frontend_url")
    @classmethod
    def validate_frontend_url(cls, value: str) -> str:
        """Require FRONTEND_URL to be an absolute HTTP(S) origin."""
        normalized_value = value.strip().rstrip("/")
        parsed = urlparse(normalized_value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("FRONTEND_URL must be an absolute http(s) URL")
        return normalized_value

    @model_validator(mode="after")
    def validate_cookie_samesite_secure_combination(self) -> Settings:
        """Enforce browser-compatible SameSite=None cookie settings."""
        if self.cookie_samesite == "none" and not self.cookie_secure:
            raise ValueError("COOKIE_SECURE must be true when COOKIE_SAMESITE is 'none'")
        return self

    @model_validator(mode="after")
    def validate_production_boundary_settings(self) -> Settings:
        """Require production-safe cookie, origin, and host settings."""
        if self.environment.lower() != "production":
            return self

        if not self.cookie_secure:
            raise ValueError("COOKIE_SECURE must be true when ENVIRONMENT is 'production'")
        if not self.allowed_hosts:
            raise ValueError("ALLOWED_HOSTS must be non-empty when ENVIRONMENT is 'production'")

        parsed_frontend_url = urlparse(self.frontend_url)
        if parsed_frontend_url.hostname in LOCALHOST_HOSTS:
            raise ValueError("FRONTEND_URL must not use localhost when ENVIRONMENT is 'production'")

        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings for module-level use."""
    return Settings()


def get_database_url(default_url: str | None = None) -> str:
    """Resolve DATABASE_URL without constructing full app settings."""
    env_url = os.getenv("DATABASE_URL")
    if env_url and env_url.strip():
        return env_url.strip()
    if default_url and default_url.strip():
        return default_url.strip()
    return "postgresql+asyncpg://user:pass@localhost:5432/stima"
