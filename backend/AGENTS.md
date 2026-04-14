# Backend AGENTS — Stima

Apply this file when primary scope is `backend/` or issue labels include `area:backend` / `area:database`.

## Backend Defaults

- Preserve explicit layering: `api -> services -> repositories -> integrations/libs`.
- Keep route modules thin; orchestration/policy belong in services.
- Repositories own persistence/query logic only.
- Match existing feature-first structure under `backend/app/features/*`.

## Contracts And Data Rules

- Use SQLAlchemy 2.0 style only (`Mapped`/`mapped_column`, `select()` + async session APIs).
- Do not use SQLAlchemy 1.x `Column()` model style or `db.query(...)`.
- Do not modify applied migrations; create a new migration instead.
- For no-contract refactors, verify parity lock:
  - status code parity
  - response schema parity
  - error semantics parity
  - side-effect parity

## Selective Test-First Guidance

For bug fixes, backend business logic, contract-sensitive behavior, and stateful/cross-layer changes, identify the first test/assertion to add before implementation when practical.

## Verification Tiers (Backend)

- Tier 1 (implementation loop): smallest backend checks proving changed behavior.
  - Example: `cd backend && .venv/bin/pytest app/features/<feature>/tests/test_<scope>.py`
  - Example: `cd backend && ruff check app/features/<feature>`
- Tier 2 (post-review patch): rerun only checks covering patched findings unless scope expands.
- Tier 3 (PR/final gate): `make backend-verify` (or `make verify` when cross-surface).
- Tier 4 (operator-only heavy): live/provider-backed checks run by human operator when explicitly required.

## Agent Runtime Constraints

- Do not run bare `pytest` from agent sessions; use `cd backend && .venv/bin/pytest ...` for targeted tests.
- Backend pytest uses host-local services in this repo; if backend tests are required, prefer escalated runs over repeated sandbox retries.
- If sandboxed pytest hangs during startup/collection, suspect sandbox-to-local-service access first.
- Do not run `make db-verify` or live extraction checks from agent sessions.

## Practical File-Size Budgets

- backend route/service/repository modules target `<=220` LOC
- `300-350` LOC can be acceptable when cohesive
- split or create follow-up when route/service/repository exceeds `350` LOC
