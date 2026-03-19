# Task: Auth Foundation 04 - Integration/MSW Auth Regression Coverage

## Goal
Add integration-level auth regression coverage and shared MSW infrastructure that validates end-to-end auth transport contracts.

## Parent Spec
Parent Spec: #1

## Scope

**In:**
- MSW auth handlers (v2 API) with contract-enforcing CSRF validation
- Shared mock server wiring (`setup.ts`, `server.ts`, `handlers.ts`)
- Extend `http.test.ts` with 3 missing transport-level cases (vi.stubGlobal, no MSW)
- New `authService.integration.test.ts` for service→transport→MSW roundtrip tests

**Out:**
- Component-level form/hook tests (Task 03 owns `useAuth.test.tsx`, `LoginForm.test.tsx`, `RegisterForm.test.tsx`, `App.routes.test.tsx`)
- React auth state management (`user = null` in useAuth is Task 03 scope)
- Backend changes except test-support fixes
- Migrating existing `http.test.ts` tests to MSW (they stay as vi.stubGlobal)

## File targets

| File | Action | Purpose |
|---|---|---|
| `src/shared/tests/mocks/handlers.ts` | Create | Base success handlers with CSRF contract validation |
| `src/shared/tests/mocks/server.ts` | Create | `setupServer(...handlers)` export |
| `src/shared/tests/setup.ts` | Modify | Wire MSW server lifecycle + `onUnhandledRequest: 'error'` |
| `src/shared/lib/http.test.ts` | Extend | 3 missing transport cases (vi.stubGlobal, deterministic) |
| `src/features/auth/tests/authService.integration.test.ts` | Create | Service + transport integration via MSW |

## MSW handler design

Handlers encode the backend auth contract. Endpoints that require CSRF must return 403 when the header is missing — this catches regressions where code stops sending CSRF.

Use **MSW v2 API only** (`http.*`, `HttpResponse.json()`). Do NOT use v1 patterns (`rest.*`, `ctx.json()`).

```
POST /api/auth/login     — no CSRF check, returns { csrf_token: "test-csrf-token" } 200
POST /api/auth/register  — no CSRF check, returns { user: { id, email, is_active } } 201
POST /api/auth/refresh   — VALIDATES X-CSRF-Token (403 if missing), returns { csrf_token: "refreshed-csrf-token" } 200
POST /api/auth/logout    — VALIDATES X-CSRF-Token (403 if missing), returns 204
GET  /api/auth/me        — returns { id, email, is_active } 200 (default: authenticated)
```

Per-test overrides use `server.use()` — never mutate the base handlers array.

## Cookie strategy (jsdom limitation)

MSW in jsdom cannot set cookies via `Set-Cookie` headers. Two-track approach:
- **Post-login flows**: Rely on in-memory CSRF. `authService.login()` calls `setCsrfToken()` from the response body — no cookie needed.
- **Page-reload scenarios**: Manually set `document.cookie = "stima_csrf_token=...;"` before the test to simulate what the browser would have persisted.

Do NOT attempt to test httponly cookie transport — that is a browser-level concern.

## Test cases

### http.test.ts — extend with 3 cases (vi.stubGlobal, no MSW)

These test `request()` function internals. Direct fetch control gives deterministic timing.

1. **Refresh failure → CSRF cleared + error thrown**
   - Fetch sequence: original request → 401, refresh → 401
   - Assert: `csrfToken` is cleared (next mutating request has no X-CSRF-Token header)
   - Assert: error propagates to caller

2. **Concurrent 401 single-flight**
   - Fire 2+ simultaneous `request()` calls, all receive 401
   - Assert: exactly 1 call to `/api/auth/refresh`
   - Assert: all original requests are retried after refresh resolves

3. **Rotated CSRF token used on replay (not boot token)**
   - Extends the existing page-reload test pattern
   - Fetch sequence: original → 401, refresh returns `{ csrf_token: "rotated-token" }`, replay
   - Assert: the replayed request carries `"rotated-token"` (check `fetchMock.mock.calls[2]` headers)
   - This is the security-critical assertion the existing test is missing

### authService.integration.test.ts — 6 cases (MSW)

These test the real path: `authService.*` → `request()` → `fetch` → MSW → response parsing.

1. **Login → CSRF propagation**
   - `authService.login({ email, password })` → MSW receives correct body
   - Then `authService.logout()` → MSW receives X-CSRF-Token header with the token from login response
   - Validates the full login→CSRF→mutating-request chain

2. **Register → correct payload and response**
   - `authService.register({ email, password })` → MSW receives correct body → returns user matching `User` type

3. **Logout → CSRF state cleared**
   - Login first, then `authService.logout()`
   - After logout, set up a new MSW handler for a mutating endpoint
   - Assert: next mutating request has no X-CSRF-Token header

4. **Session expired → auto-refresh → success (end-to-end)**
   - Override `GET /api/auth/me` to return 401 once, then 200
   - `authService.me()` → 401 → auto-refresh fires → retry succeeds → user returned
   - Validates the full 401→refresh→replay chain through MSW

5. **Login bad credentials → error message preserved**
   - Override login handler to return 401 with `{ detail: "Invalid credentials" }`
   - Assert: thrown error message matches `"Invalid credentials"`

6. **Refresh failure cascade → CSRF cleared + error propagated**
   - Override `me` to return 401, override `refresh` to also return 401
   - Assert: error thrown to caller, CSRF state cleared

## Implementation notes

- Call `clearCsrfToken()` in `afterEach` for all test files that use the real `request()` function.
- `refreshInFlight` resets via its own `finally` block — safe as long as every test awaits its promises. Do not add a reset export for this.
- In `setup.ts`, add MSW lifecycle: `beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))`, `afterEach(() => server.resetHandlers())`, `afterAll(() => server.close())`.
- Existing component tests mock `authService` at the module level so they never reach `fetch` — `onUnhandledRequest: 'error'` will not break them.
- For the concurrent single-flight test in `http.test.ts`: use a fetch mock that tracks call count. No deferred resolvers needed — `vi.stubGlobal` with `mockResolvedValue` gives sufficient control since all promises resolve in the same microtask queue.

## Do NOT duplicate

These are already covered and must not be re-tested:
- CSRF hydration from cookie on mutating request (`http.test.ts` line 32)
- Basic 401→refresh→retry happy path (`http.test.ts` line 47)
- `useAuth` hook state transitions (`useAuth.test.tsx`)
- Component rendering and form behavior (`LoginForm.test.tsx`, `RegisterForm.test.tsx`)
- Route guards (`App.routes.test.tsx`)

## Dependencies
- Depends on Task 03

## Acceptance criteria
- [ ] MSW infrastructure wired: `handlers.ts`, `server.ts`, `setup.ts` lifecycle with `onUnhandledRequest: 'error'`
- [ ] MSW handlers validate CSRF on refresh/logout endpoints (403 on missing header)
- [ ] `http.test.ts` extended with: refresh failure, concurrent single-flight, rotated token on replay
- [ ] `authService.integration.test.ts` covers: login→CSRF propagation, register, logout→CSRF cleared, session-expired→refresh→success, bad credentials error, refresh failure cascade
- [ ] All tests pass: `cd frontend && npx vitest run`
- [ ] No duplication with existing transport unit tests or Task 03 component tests
- [ ] Existing test suites unbroken by MSW wiring

## Verification
```bash
cd frontend && npx vitest run
cd frontend && npx tsc --noEmit && npx eslint src/ && npm run build
```

## PR checklist
- [ ] PR references this issue (`Closes #...`)
- [ ] Docs updated if needed (architecture/patterns/review checklist/ADR)
- [ ] Tests added/updated where needed
