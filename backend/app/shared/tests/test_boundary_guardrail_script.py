"""Regression tests for backend boundary guardrail script behavior."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load_boundary_module():
    repo_root = Path(__file__).resolve().parents[4]
    script_path = repo_root / "scripts" / "check_backend_boundaries.py"
    module_name = "stima_boundary_check_test_module"
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    assert spec is not None
    assert spec.loader is not None

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def test_scan_flags_relative_imports_in_boundary_checked_files(tmp_path: Path) -> None:
    boundary_module = _load_boundary_module()
    api_file = tmp_path / "backend" / "app" / "features" / "demo" / "api.py"
    api_file.parent.mkdir(parents=True)
    api_file.write_text("from . import repository\n", encoding="utf-8")

    violations = boundary_module.scan(tmp_path)

    assert any("Relative imports are not allowed" in violation for violation in violations)
