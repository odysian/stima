# Task: Auth Foundation 01 - DB + Security Core

## Goal
Build the backend auth substrate: async DB/session/config plumbing, auth data models, migration, and security primitives.

## Parent Spec
Parent Spec: #1

## Scope
**In:**
- `users` and `refresh_tokens` SQLAlchemy models (UUID keys)
- Alembic migration for auth foundation tables
- Async database/session setup for app runtime
- Config values for auth/cookie settings
- Security helpers: password hash/verify, JWT encode/decode, token hashing helpers

**Out:**
- Auth route handler implementation
- Frontend auth flow
- Integration/MSW coverage

## Implementation notes
- SQLAlchemy 2.0 style only (`Mapped`, `mapped_column`, async sessions).
- Registration allows nullable onboarding fields; onboarding enforcement happens later.
- Refresh token table stores hashed tokens + soft-revoke column (`revoked_at`).
- Cookie behavior is env-driven, not hard-coded.

## Dependencies
- None (first execution task)

## Acceptance criteria
- [ ] Auth models compile and map correctly.
- [ ] Alembic env is wired to target metadata and supports migration generation/apply.
- [ ] New migration applies cleanly (`alembic upgrade head`) on local DB.
- [ ] Security helpers support email-login auth flow requirements.
- [ ] No auth endpoints are implemented in this task.

## Verification
```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest
cd backend && alembic upgrade head
```

## PR checklist
- [ ] PR references this issue (`Closes #...`)
- [ ] Docs updated if needed (architecture/patterns/review checklist/ADR)
- [ ] Tests added/updated where needed
