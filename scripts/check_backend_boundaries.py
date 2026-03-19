#!/usr/bin/env python3
"""Validate backend feature-layer import boundaries."""

from __future__ import annotations

import ast
import sys
from dataclasses import dataclass
from pathlib import Path

FEATURES_ROOT = Path("backend/app/features")
APP_FEATURES_PREFIX = "app.features."
LAYER_BY_FILENAME = {
    "api.py": "api",
    "service.py": "service",
    "repository.py": "repository",
}


@dataclass(frozen=True)
class ImportRef:
    """Resolved import reference used for boundary checks."""

    module: str
    lineno: int


def _iter_imports(tree: ast.AST) -> list[ImportRef]:
    refs: list[ImportRef] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                refs.append(ImportRef(module=alias.name, lineno=node.lineno))
            continue

        if not isinstance(node, ast.ImportFrom):
            continue
        if node.module is None:
            continue

        if node.module == "app":
            for alias in node.names:
                if alias.name == "*":
                    refs.append(ImportRef(module="app", lineno=node.lineno))
                else:
                    refs.append(ImportRef(module=f"app.{alias.name}", lineno=node.lineno))
            continue

        for alias in node.names:
            if alias.name == "*":
                refs.append(ImportRef(module=node.module, lineno=node.lineno))
            else:
                refs.append(
                    ImportRef(module=f"{node.module}.{alias.name}", lineno=node.lineno)
                )

    return refs


def _module_contains_layer(module: str, layer: str) -> bool:
    if not module.startswith(APP_FEATURES_PREFIX):
        return False
    return layer in module.split(".")


def _layer_for_file(path: Path) -> str | None:
    return LAYER_BY_FILENAME.get(path.name)


def _validate_file(path: Path, layer: str) -> list[str]:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    refs = _iter_imports(tree)

    violations: list[str] = []
    for ref in refs:
        if layer == "api" and _module_contains_layer(ref.module, "repository"):
            violations.append(
                f"{path}:{ref.lineno}: API layer cannot import repositories ({ref.module})"
            )
            continue

        if layer == "service" and _module_contains_layer(ref.module, "api"):
            violations.append(
                f"{path}:{ref.lineno}: Service layer cannot import API layer ({ref.module})"
            )
            continue

        if layer == "repository" and _module_contains_layer(ref.module, "api"):
            violations.append(
                f"{path}:{ref.lineno}: Repository layer cannot import API layer ({ref.module})"
            )
            continue

        if layer == "repository" and _module_contains_layer(ref.module, "service"):
            violations.append(
                f"{path}:{ref.lineno}: Repository layer cannot import services ({ref.module})"
            )

    return violations


def scan(repo_root: Path) -> list[str]:
    """Return all boundary violations found under backend feature modules."""
    features_root = repo_root / FEATURES_ROOT
    violations: list[str] = []

    for path in sorted(features_root.rglob("*.py")):
        layer = _layer_for_file(path)
        if layer is None:
            continue
        violations.extend(_validate_file(path, layer))

    return violations


def main(argv: list[str]) -> int:
    if len(argv) > 2:
        print("Usage: check_backend_boundaries.py [repo-root]", file=sys.stderr)
        return 2

    repo_root = Path(argv[1]).resolve() if len(argv) == 2 else Path.cwd().resolve()
    violations = scan(repo_root)
    if not violations:
        print("Backend boundary check passed.")
        return 0

    print("Backend boundary check failed:")
    for violation in violations:
        print(f" - {violation}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

