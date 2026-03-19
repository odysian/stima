# Patterns - Stima

Record conventions that already exist in code.

## Boundary Contract (Mandatory)
- Allowed: `api -> services -> repositories -> integrations/libs`
- Disallowed: reverse imports and cross-layer shortcuts.
- Public service functions must add value (orchestration/validation/policy/transactions), not pass-through wrappers.
- Repositories contain persistence/query logic only, no transport concerns.
- Enforced by `scripts/check_backend_boundaries.py` (runs in `make backend-verify`).

## SQLAlchemy 2.0 Style (Mandatory)
- Use SQLAlchemy 2.0 typed ORM style: `Mapped[...]` with `mapped_column(...)`.
- Use async 2.0 query style with `select(...)` and async session methods (`scalar`, `scalars`, `execute`) with `await`.
- Do not use SQLAlchemy 1.x model/query style (`Column(...)` model fields, `db.query(...)`, or sync-only session patterns).

## Feature Model Registry (Mandatory)
- New feature models must be imported in `backend/app/features/registry.py`.
- Alembic autogenerate uses this registry for metadata discovery. Skipping it causes silent migration drift.

## Config Guardrails (Mandatory)
- `SECRET_KEY` is validated at startup: minimum 32 characters, known placeholder values rejected.
- Cookie `SameSite=none` requires `Secure=true` (enforced by pydantic model validator).
- All cookie behavior is env-driven (`COOKIE_SECURE`, `COOKIE_SAMESITE`, `COOKIE_DOMAIN`), never hard-coded.

## Auth Transport (Backend)
- Cookie-based auth with httpOnly access + refresh tokens.
- CSRF double-submit: mutating authenticated endpoints validate `X-CSRF-Token` header. Login and register are exempt (no session yet).
- Refresh rotation: consumed token is soft-revoked (`revoked_at`), new token issued. Replay of a revoked token revokes the entire token family.
- Multi-device: multiple active refresh tokens per user are allowed.
- Rate limiting on auth endpoints via `slowapi` with proxy-aware IP extraction.

## Auth Transport (Frontend)
- CSRF token is stored as a module-level variable in `http.ts` — not React state (avoids re-renders), not `localStorage` (XSS-accessible).
- `credentials: 'include'` on every `fetch` call.
- `X-CSRF-Token` header set automatically on mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`).
- CSRF hydration from cookie as fallback on bootstrap, refresh, and lazy mutating requests.
- Single-flight refresh guard: concurrent 401 responses share one refresh promise. No duplicate refresh calls.
- Auth service owns token lifecycle (`setCsrfToken`/`clearCsrfToken`). Components never touch CSRF state directly.

## Frontend Test Layer Split (Mandatory)
- **Component tests**: use `vi.mock` on service modules. No MSW, no real `fetch`. Test rendering, user interaction, and state transitions.
- **Integration tests**: use MSW against the real transport chain (`authService` → `request()` → `fetch` → MSW). Test service-to-transport contracts.
- **Transport tests**: use `vi.stubGlobal('fetch', ...)` for deterministic control. Test `request()` internals (retry, single-flight, header propagation).
- Layers do not mix. Component tests never hit `fetch`. Transport tests never use MSW.

## MSW Handler Design
- Base handlers in `src/shared/tests/mocks/handlers.ts` encode the backend contract.
- CSRF-protected endpoints (refresh, logout) must return 403 when `X-CSRF-Token` is missing — this catches regressions where code stops sending CSRF.
- Per-test overrides use `server.use()`. Never mutate the base handlers array.
- Use MSW v2 API only (`http.*`, `HttpResponse.json()`). Do not use v1 patterns (`rest.*`, `ctx.json()`).
- `onUnhandledRequest: 'error'` in test setup to catch unmocked network calls.

## File-Size Budgets
- Frontend leaf components: target `<=250` LOC.
- Frontend hooks/services: target `<=180` LOC.
- Backend route/service/repository modules: target `<=220` LOC.
- Split or create linked follow-up when modules exceed split thresholds.

## Verification Reference
Canonical targets:
```bash
make backend-verify
make frontend-verify
make verify          # both
```

Raw commands (fallback):
```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
