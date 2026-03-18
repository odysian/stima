# Spec: Auth Foundation (Cookie Auth + CSRF + DB Base)

## Summary
Establish Stima's authentication and database foundation for Slice 0 using async FastAPI + SQLAlchemy 2.0 with httpOnly cookie auth, double-submit CSRF, and refresh token rotation.

## Value / User Impact
- Enables secure, reliable sign-in and persistent sessions across mobile/desktop usage.
- Creates the baseline required for onboarding and all authenticated quote workflows.

## Scope
**In scope:**
- User + refresh token schema and migration
- Async DB/session/config foundation for auth
- Auth endpoints (register, login, refresh, logout, me)
- Cookie transport + CSRF protection
- Frontend auth transport/context/forms/protected routing
- Frontend auth component tests and auth integration coverage

**Out of scope:**
- Quote/customer/profile feature execution
- Async background jobs
- OAuth/social login
- `/api/auth/csrf` helper endpoint in Slice 0

## How it works (expected behavior)
1. User registers with email/password only; onboarding fields remain nullable until onboarding completes.
2. Login sets httpOnly access/refresh cookies and returns csrf token in JSON body.
3. Mutating authenticated requests send `X-CSRF-Token` with `credentials: include`; backend validates double-submit token.
4. Expired access token triggers one refresh attempt; refresh rotates token and soft-revokes prior token row.
5. Logout soft-revokes active refresh token and clears cookies.

## Backend plan (if applicable)
- API changes:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
- Schema changes:
  - `users` table with nullable onboarding fields at registration
  - `refresh_tokens` table with `token_hash`, multi-device support, and `revoked_at`
- Events / realtime changes:
  - None
- Guardrails:
  - Argon2id hashing
  - short-lived access token (15m), refresh token (30d)
  - cookie-auth + CSRF double-submit
  - env-driven cookie settings (`COOKIE_SECURE`, `COOKIE_SAMESITE`, `COOKIE_DOMAIN`)

## Frontend plan
- State model:
  - Context provider for auth state + bootstrap + logout
- UI components touched:
  - `LoginForm`, `RegisterForm`, app route guard wiring
- Edge cases:
  - single-flight refresh for concurrent 401s
  - session clear on refresh failure
  - register -> onboarding redirect

## Files expected
- Backend:
  - `backend/app/core/config.py`
  - `backend/app/core/database.py`
  - `backend/alembic/env.py`
  - `backend/alembic/versions/*`
  - `backend/app/core/security.py`
  - `backend/app/features/auth/{models,schemas,repository,service,api}.py`
  - `backend/app/shared/dependencies.py`
  - `backend/app/main.py`
  - `backend/conftest.py`
  - `backend/app/features/auth/tests/test_auth.py`
- Frontend:
  - `frontend/src/shared/lib/{api.types.ts,http.ts}`
  - `frontend/src/features/auth/{types,services,hooks,components}`
  - `frontend/src/features/auth/tests/*`
  - `frontend/src/shared/tests/mocks/{handlers.ts,server.ts}`
  - `frontend/src/App.tsx`
- Docs:
  - Follow-up only if behavior/contracts/patterns change during implementation

## Tests
- Backend:
  - auth endpoint + rotation + CSRF tests
  - transactional fixture coverage
- Frontend:
  - Task C: component tests for `LoginForm` and `RegisterForm`
  - Task D: integration-level auth transport/MSW regression tests
- Regression:
  - refresh rotation semantics, CSRF mismatch/missing behaviors, cookie clear behavior

## Decision locks (must be Locked before implementation for backend-coupled work)
- [x] Locked: Registration keeps onboarding fields nullable (`business_name`, `owner_name`, `trade_type`) and enforces during onboarding flow.
- [x] Locked: Production topology is same-site subdomains under `stima.odysian.dev`; cookie domain is `.stima.odysian.dev`.
- [x] Locked: Production cookie defaults are env-driven with `COOKIE_SAMESITE=lax`, `COOKIE_SECURE=true`, `COOKIE_DOMAIN=.stima.odysian.dev`.
- [x] Locked: Refresh model supports multi-device sessions and uses soft-revoke (`revoked_at`) for audit trail.
- [x] Locked: Login identifier is email only.
- [x] Locked: `/api/auth/csrf` endpoint is out of scope for Slice 0.
- [x] Locked: Token lifetimes are 15 minutes access / 30 days refresh.
- [x] Locked: Frontend uses context-provider auth state, and register redirects to onboarding.

## ADR links (if lasting architecture/security/perf decision)
- ADR: TBD during implementation if needed

## Child tasks (gated)
- #2 Task 1: DB + security core
- #3 Task 2: Backend auth API + cookie/CSRF flow
- #4 Task 3: Frontend auth state/forms/routes + component tests
- #5 Task 4: Integration/MSW auth regression coverage

## Acceptance criteria
- [ ] Spec decisions above remain the source of truth for implementation.
- [ ] Child tasks are created and linked to this Spec.
- [ ] Child tasks include explicit acceptance criteria and verification commands.
- [ ] No implementation begins until ready Task is selected.

## Verification
```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest && cd ../frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```

## Notes
- This is a gated control-plane Spec for `auth-foundation`.
- Execution is one Task issue at a time.
