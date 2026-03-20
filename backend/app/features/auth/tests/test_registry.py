"""Registry import tests for Alembic model discovery."""

from __future__ import annotations

from importlib import import_module

from app.core.database import Base


def test_feature_registry_import_loads_auth_models() -> None:
    import_module("app.features.registry")

    assert "users" in Base.metadata.tables
    assert "refresh_tokens" in Base.metadata.tables
