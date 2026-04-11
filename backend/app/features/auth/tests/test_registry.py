"""Registry import tests for Alembic model discovery."""

from __future__ import annotations

from importlib import import_module

from app.core.database import Base


def test_feature_registry_import_loads_auth_models() -> None:
    import_module("app.features.registry")

    assert "event_logs" in Base.metadata.tables
    assert "job_records" in Base.metadata.tables
    assert "users" in Base.metadata.tables
    assert "refresh_tokens" in Base.metadata.tables
    assert "password_reset_tokens" in Base.metadata.tables
