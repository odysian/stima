# Workflow: Verify

Verification tiers, canonical commands, and runtime constraints.

## Verification

Run the relevant checks before claiming completion.

### Verification Tiers

- Tier 1 (implementation loop): run the smallest checks that prove changed behavior.
- Tier 2 (post-review patch): rerun only checks needed for patched findings unless scope expands.
- Tier 3 (PR/final gate): run canonical broad verify targets for affected surfaces (`make backend-verify`, `make frontend-verify`, `make verify` as applicable).
- Tier 4 (operator-only heavy): live/provider/manual or unusually expensive checks only when explicitly required.

Agent execution note:
- Do not run live/provider-backed verification targets from agent sessions (for example `make extraction-live`); ask the human operator to run them manually and share output.
- Do not run bare `pytest` from agent sessions. Use `make backend-verify` for broad backend verification, or `cd backend && .venv/bin/pytest ...` for targeted backend tests so the repo venv is used consistently.
- Backend pytest depends on host-local services in this repo's test harness (see `backend/conftest.py`). When backend tests are needed from an agent session, prefer an escalated run outside the sandbox over repeated retries inside the network-isolated sandbox.
- If sandboxed backend pytest hangs during startup, collection, or before first assertion, treat sandbox/service access as the default suspect and verify that path before debugging application code.

### Makefile Verification Contract (Recommended)

If the repo uses `make` for verification, standardize on these targets:

- `make verify` (full verification aggregator)
- `make backend-verify` (backend lint/type-check/tests/security checks as applicable)
- `make frontend-verify` (frontend type-check/tests/lint/build as applicable)
- `make db-verify` (migrations/schema checks when applicable)
- `make template-verify` (template-level checks such as unresolved-token guard)

Contract rules:

- Targets must be deterministic, non-interactive, and fail-fast (non-zero exit on failure).
- CI should run the same `make` targets used locally.
- Keep target names and scope stable; if changed, update README + workflow docs in the same Task.

### Full Verification

```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest && cd ../frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```

### Frontend Verification

```bash
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```

### Backend Verification

```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest
```

### Database Verification

```bash
cd backend && alembic upgrade head
```

### Verification Baseline Expectations

- Backend: boundary guardrail check + lint + type-check + tests + security scan.
- Frontend: type-check + tests + lint + production build.
- No-contract refactors: include parity lock results in final verification summary.
- Template maintenance: unresolved-token guard passes (`./scripts/check-unresolved-template-tokens.sh`).
