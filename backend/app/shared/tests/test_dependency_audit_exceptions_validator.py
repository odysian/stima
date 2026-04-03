"""Regression tests for dependency audit exception validation."""

from __future__ import annotations

import importlib.util
import sys
from datetime import date
from pathlib import Path


def _load_validator_module():
    repo_root = Path(__file__).resolve().parents[4]
    script_path = repo_root / "scripts" / "validate_dependency_audit_exceptions.py"
    module_name = "stima_dependency_audit_validator_test_module"
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    assert spec is not None
    assert spec.loader is not None

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def test_validate_payload_accepts_required_fields_in_any_order() -> None:
    validator = _load_validator_module()

    payload = {
        "exceptions": [
            {
                "package": "jinja2",
                "id": "audit-001",
                "advisory": "GHSA-1234",
                "reason": "tracked in upstream patch rollout",
                "ecosystem": "pip",
                "expires_on": "2099-01-01",
                "owner": "backend",
            }
        ]
    }

    assert validator.validate_payload(payload, today=date(2026, 4, 3)) is None


def test_validate_payload_rejects_unknown_or_missing_fields() -> None:
    validator = _load_validator_module()

    payload = {
        "exceptions": [
            {
                "id": "audit-001",
                "ecosystem": "pip",
                "package": "jinja2",
                "advisory": "GHSA-1234",
                "reason": "tracked in upstream patch rollout",
                "owner": "backend",
                "extra": "unexpected",
            }
        ]
    }

    error_message = validator.validate_payload(payload, today=date(2026, 4, 3))

    assert error_message is not None
    assert "exactly these fields" in error_message
    assert "missing: expires_on" in error_message
    assert "unknown: extra" in error_message


def test_validate_payload_allows_today_and_rejects_expired_entries() -> None:
    validator = _load_validator_module()

    valid_payload = {
        "exceptions": [
            {
                "id": "audit-001",
                "ecosystem": "npm",
                "package": "vite",
                "advisory": "GHSA-5678",
                "reason": "awaiting upstream patch release",
                "owner": "frontend",
                "expires_on": "2026-04-03",
            }
        ]
    }
    expired_payload = {
        "exceptions": [
            {
                "id": "audit-002",
                "ecosystem": "npm",
                "package": "vite",
                "advisory": "GHSA-5678",
                "reason": "awaiting upstream patch release",
                "owner": "frontend",
                "expires_on": "2026-04-02",
            }
        ]
    }

    assert validator.validate_payload(valid_payload, today=date(2026, 4, 3)) is None
    assert (
        validator.validate_payload(expired_payload, today=date(2026, 4, 3))
        == "entry 1 is expired on 2026-04-02"
    )


def test_validate_payload_rejects_non_string_field_values() -> None:
    validator = _load_validator_module()

    payload = {
        "exceptions": [
            {
                "id": "audit-001",
                "ecosystem": "pip",
                "package": "jinja2",
                "advisory": "GHSA-1234",
                "reason": "tracked in upstream patch rollout",
                "owner": "backend",
                "expires_on": 20260403,
            }
        ]
    }

    assert (
        validator.validate_payload(payload, today=date(2026, 4, 3))
        == "entry 1 field 'expires_on' must be a non-empty string"
    )
