# Task: Auth Foundation 02 - Backend Auth API (Cookies + CSRF + Rotation)

## Goal
Implement backend auth endpoints and cookie/CSRF/refresh behavior on top of Task 01 substrate.

## Parent Spec
Parent Spec: #1

## Scope
**In:**
- Auth schemas/repository/service/api modules
- Endpoints: register, login, refresh, logout, me
- Cookie set/clear behavior with env-driven domain/samesite/secure
- Double-submit CSRF dependency behavior
- Atomic refresh rotation with multi-device support and soft-revoke
- Backend auth test coverage for endpoint/security behavior

**Out:**
- Frontend auth state/forms/routes
- `/api/auth/csrf` helper endpoint (explicitly excluded for Slice 0)

## Implementation notes
- Login identifier is email only.
- Access token TTL: 15 minutes; refresh token TTL: 30 days.
- Multi-device allowed: multiple active refresh tokens per user.
- Rotation should soft-revoke consumed token and issue a new token.
- CSRF should apply to mutating cookie-auth requests while preserving auth bootstrap paths.

## Dependencies
- Depends on Task 01

## Acceptance criteria
- [ ] Auth endpoint contracts match Spec decisions.
- [ ] Cookies use `.stima.odysian.dev` domain in prod via env configuration.
- [ ] CSRF missing/mismatch handling is explicitly tested.
- [ ] Refresh rotation and revocation semantics are explicitly tested.
- [ ] Logout clears auth cookies and revokes target token.
- [ ] No frontend implementation in this task.

## Verification
```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest
```

## PR checklist
- [ ] PR references this issue (`Closes #...`)
- [ ] Docs updated if needed (architecture/patterns/review checklist/ADR)
- [ ] Tests added/updated where needed
