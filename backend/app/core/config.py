"""Application settings for database, auth, and cookie behavior."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Annotated, Any, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-backed runtime settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    database_url: str = Field(
        default="postgresql+asyncpg://user:pass@localhost:5432/stima",
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
    frontend_url: str = Field(
        default="http://localhost:5173",
        validation_alias="FRONTEND_URL",
    )
    allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"],
        validation_alias="ALLOWED_ORIGINS",
    )
    trusted_proxy_ips: Annotated[list[str], NoDecode] = Field(
        default_factory=list,
        validation_alias="TRUSTED_PROXY_IPS",
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

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, value: str) -> str:
        """Fail fast when SECRET_KEY is missing or blank."""
        if not value.strip():
            raise ValueError("SECRET_KEY must be set and non-empty")
        return value

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def normalize_allowed_origins(cls, value: Any) -> list[str]:
        """Allow ALLOWED_ORIGINS as CSV string or list."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        if isinstance(value, list):
            return [str(origin).strip() for origin in value if str(origin).strip()]
        return ["http://localhost:5173"]

    @field_validator("trusted_proxy_ips", mode="before")
    @classmethod
    def normalize_trusted_proxy_ips(cls, value: Any) -> list[str]:
        """Allow TRUSTED_PROXY_IPS as CSV string or list."""
        if isinstance(value, str):
            return [ip.strip() for ip in value.split(",") if ip.strip()]
        if isinstance(value, list):
            return [str(ip).strip() for ip in value if str(ip).strip()]
        return []

    @model_validator(mode="after")
    def validate_cookie_samesite_secure_combination(self) -> Settings:
        """Enforce browser-compatible SameSite=None cookie settings."""
        if self.cookie_samesite == "none" and not self.cookie_secure:
            raise ValueError(
                "COOKIE_SECURE must be true when COOKIE_SAMESITE is 'none'"
            )
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
