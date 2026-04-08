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

## Observability (Backend)
- Use `stima.events` for pilot analytics events that may also persist to `event_logs`.
- Use `stima.security` for stdout-only security and operational logs; do not write those events to `event_logs`.
- Every structured security/ops log includes `event`, `timestamp`, `level`, `logger`, `correlation_id`, and `outcome`.
- Request-scoped logs also include `method`, `route_template`, `status_code`, and `client_ip_hash`.
- Token-derived references must use keyed HMAC-SHA256 hashes (`token_ref_hash`), never raw token material.
- Token-bearing access logs must redact route templates for `/api/public/doc/{token}`, `/share/{token}`, and `/doc/{token}`.
- Repeated identical security events should be emission-rate-limited to avoid log floods.
- Keep operational guidance linked from docs, not hidden in code comments:
  - [redis-provisioning-config.md](/home/odys/stima/docs/runbooks/redis-provisioning-config.md)
  - [worker-startup-monitoring.md](/home/odys/stima/docs/runbooks/worker-startup-monitoring.md)
  - [proxy-header-alignment.md](/home/odys/stima/docs/runbooks/proxy-header-alignment.md)
  - [production-readiness-checklist.md](/home/odys/stima/docs/runbooks/production-readiness-checklist.md)

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

## Backend Test Suite Patterns (Current Conventions)
- Keep each test focused on one contract: status code, response shape, and key side effect.
- Isolate persistence per test with transactional rollback + nested savepoint restart; never rely on test order.
- Shared `client` fixture binds `get_db` to a per-test session and restores dependency overrides on teardown.
- Shared `client` fixture disables `app.state.limiter.enabled` by default; tests that assert `429` behavior explicitly re-enable limiter for that test.
- Event-log DB persistence is disabled by default in backend test fixtures to avoid background-task coupling.
- External-provider tests are opt-in via `@pytest.mark.live` and excluded from default verify (`-m "not live"`).

## MSW Handler Design
- Base handlers in `src/shared/tests/mocks/handlers.ts` encode the backend contract.
- CSRF-protected endpoints (refresh, logout) must return 403 when `X-CSRF-Token` is missing — this catches regressions where code stops sending CSRF.
- Per-test overrides use `server.use()`. Never mutate the base handlers array.
- Use MSW v2 API only (`http.*`, `HttpResponse.json()`). Do not use v1 patterns (`rest.*`, `ctx.json()`).
- `onUnhandledRequest: 'error'` in test setup to catch unmocked network calls.

## Design System (Mandatory For Frontend Work)
- All frontend visual decisions (colors, typography, elevation, card patterns, interaction states, icons) are defined in `docs/DESIGN.md`.
- `docs/DESIGN.md` is the authoritative reference for how things should look. This file (`PATTERNS.md`) covers code structure and which shared components to use.
- When building or modifying frontend UI, read `docs/DESIGN.md` first.

## Shared Screen Primitives (Mandatory For New Screens)
- `ScreenHeader` (`@/shared/components/ScreenHeader`):
  - Use for top app bars with back navigation on screen-style views.
  - Props: `title`, optional `subtitle`, `onBack`, optional `trailing`.
  - Canonical shell styling: `fixed top-0 z-50 h-16 w-full bg-white/80 backdrop-blur-md shadow-[0_0_24px_rgba(13,28,46,0.04)]`.
- `ScreenFooter` (`@/shared/components/ScreenFooter`):
  - Use for sticky bottom action bars (primary submit/continue flows).
  - Props: `children`.
  - Canonical shell styling: `fixed bottom-0 z-40 w-full bg-white/80 backdrop-blur-md p-4 shadow-[0_-4px_24px_rgba(0,0,0,0.04)]`.
- `FeedbackMessage` (`@/shared/components/FeedbackMessage`):
  - Use for inline error feedback instead of ad-hoc red utility classes.
  - Current variant: `error` with tokenized style (`border-error bg-error-container text-error`).
- `ConfirmModal` (`@/shared/components/ConfirmModal`):
  - Use for explicit stay/leave, discard, or destructive confirmation flows instead of `window.confirm`.
  - Props: `title`, optional `body`, `confirmLabel`, `cancelLabel`, `onConfirm`, `onCancel`, optional `variant`.
  - Behavior: moves initial focus to cancel, supports `Escape` dismissal, and uses `primary` or `destructive` confirm styling.
- `formatCurrency` / `formatDate` (`@/shared/lib/formatters`):
  - Use for all money and calendar date display in UI.
  - Do not duplicate local currency/date formatter helpers in screens/components.
- New screen checklist:
  - Use `ScreenHeader` for top-bar layout.
  - Use `ScreenFooter` when actions are sticky to bottom.
  - Use `FeedbackMessage` for inline errors.
  - Use `ConfirmModal` for reusable confirmation dialogs.
  - Import `formatCurrency` / `formatDate` instead of local formatters.

## File-Size Budgets
- Enforced by `scripts/check_file_sizes.sh` with scope-aware invocation:
  - `make frontend-verify` runs `--scope frontend`
  - `make backend-verify` runs `--scope backend`
  - `make verify` runs `--scope all` once, then executes backend/frontend verification without duplicate size checks
- Frontend component files:
  - Warn (non-blocking): `>250` LOC
  - Fail (blocking): `>450` LOC
- Frontend hook/service files:
  - Warn (non-blocking): `>180` LOC
  - Fail (blocking): `>300` LOC
- Backend route/service/repository files:
  - Warn only (non-blocking): `>220` LOC
  - No hard-fail LOC threshold for backend by default.
- Backend warning evaluation rule:
  - A LOC warning is a review flag, not an automatic split mandate.
  - Split only when the two candidate halves have different collaborators/dependencies or different reasons to change.

## Implementation Analogs (Reference)
- `docs/analogs/*` is the home for repeatable implementation shapes that point at real repo examples without redefining repo-wide conventions.
- Start with:
  - `docs/analogs/transactional-email-flow.md`
  - `docs/analogs/stateful-action-matrix.md`
- Keep this file conventions-first. Add new analogs there only when a pattern is already repeated in code and worth reusing.

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
