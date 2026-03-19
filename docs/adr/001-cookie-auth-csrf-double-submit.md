# ADR-001: Cookie Auth + CSRF Double-Submit

**Date:** 2026-03-18
**Status:** Accepted
**Spec/Task:** #1 (Spec: Auth Foundation), #2 (Task 1: DB + Security Core), #3 (Task 2: Backend Auth API), #4 (Task 3: Frontend Auth Flow), #5 (Task 4: Integration/MSW Regression)

---

## Context

Stima is a FastAPI/React SPA for contractor quoting workflows. The Slice 0 auth foundation needed to establish a session model that:

- Works across a same-site subdomain topology (`stima.odysian.dev` frontend, same domain for API).
- Protects credentials against XSS without requiring custom request headers on every bootstrap.
- Supports persistent sessions (i.e., survives page reload) and multi-device usage.
- Allows safe session revocation (logout, replay protection, compromised-device logout).
- Keeps the frontend simple — no token refresh logic in individual components.

The decision space covered: where to store access tokens, how to prevent CSRF, how to store and rotate refresh tokens, and what password hashing algorithm to use.

---

## Options Considered

### Option A: Bearer token in `Authorization` header with localStorage

Access token stored in `localStorage` or `sessionStorage`. Each API call reads the token and sets `Authorization: Bearer <token>`. No cookies, no CSRF.

**Pros:**
- No CSRF attack surface — cookies aren't involved, so the browser's automatic cookie-sending behavior doesn't apply.
- Straightforward to implement; widely documented.
- Works across domains without CORS credential configuration.

**Cons:**
- `localStorage` is accessible to any JavaScript running on the page (XSS attack surface). A single XSS vulnerability exposes long-lived tokens.
- Tokens are not cleared by browser mechanisms on logout — they persist in storage until explicit removal.
- Refresh token storage has the same XSS problem: if stored in `localStorage`, an attacker can silently refresh and maintain access.

### Option B: httpOnly cookies with double-submit CSRF (chosen)

Access and refresh tokens are stored in `httpOnly` cookies, making them inaccessible to JavaScript entirely. CSRF protection uses the double-submit pattern: a separate non-`httpOnly` CSRF cookie is issued alongside the session cookies; mutating requests must echo the CSRF value back in an `X-CSRF-Token` header. The server validates that the cookie value and header value match.

**Pros:**
- `httpOnly` cookie access and refresh tokens are completely invisible to JavaScript — XSS cannot steal them.
- Double-submit CSRF works without server-side session state; the server only needs to compare two values it received in the same request.
- Browser handles cookie transmission automatically (`credentials: 'include'`); no per-request token retrieval logic needed in most of the app.
- CSRF cookie is non-`httpOnly`, so JavaScript can read it on page load or after login to seed the module-level state variable.

**Cons:**
- Requires CSRF protection for every mutating endpoint (added complexity).
- `SameSite=lax` gives partial CSRF protection (navigation POSTs are not covered), so the double-submit check remains necessary.
- Testing in jsdom is more complex — `Set-Cookie` from MSW doesn't persist, requiring a two-track test approach (in-memory CSRF from response body for most flows; manual `document.cookie` writes for reload simulation).

### Option C: Synchronizer token pattern (server-side CSRF)

Server generates a CSRF token per session, stores it server-side, and validates inbound requests against the stored value.

**Pros:**
- Stronger CSRF guarantee — token is opaque to the client and bound to a specific server-side session.

**Cons:**
- Requires server-side session storage (Redis or DB), adding infrastructure complexity.
- Contradicts the stateless-access-token design: the access JWT already encodes session identity, adding a parallel server-side session for CSRF defeats that.
- Harder to scale horizontally without sticky sessions or shared session storage.

### Option D: Stateless JWT refresh tokens (no DB storage)

Refresh tokens are JWTs signed by the server. No DB table needed — the server validates the signature and expiry claim alone.

**Pros:**
- No DB writes on refresh; simpler persistence layer.
- Horizontally scalable with no shared state for refresh validation.

**Cons:**
- Cannot revoke a specific refresh token before expiry. Logout becomes best-effort (clear cookies client-side, token still technically valid until expiry).
- Replay attacks are undetectable — a stolen refresh token remains valid for its full 30-day lifetime.
- Compromised-device logout (revoke one device's session while leaving others active) is impossible.

---

## Decision

**Cookie-based auth (Option B) with double-submit CSRF.**

Tokens are never exposed to JavaScript:

- **Access token** — httpOnly cookie, path `/api/`, 15-minute TTL, JWT (HS256).
- **Refresh token** — httpOnly cookie, path `/api/auth/`, 30-day TTL. Stored in the DB as a SHA-256 hash only (raw value never persisted).
- **CSRF token** — non-httpOnly cookie, path `/`, 30-day TTL. Also returned in login/refresh JSON response body for immediate in-memory hydration.

**CSRF protection** uses `require_csrf` as a FastAPI dependency. It reads both the `stima_csrf_token` cookie and the `X-CSRF-Token` header and calls `hmac.compare_digest` on the two values. `register` and `login` are exempt — there is no session yet at those points, so requiring CSRF would create a chicken-and-egg problem. `refresh`, `logout`, and any future mutating authenticated endpoint require CSRF.

**Refresh rotation** is opaque token with DB storage (against Option D). On every `/refresh` call, the consumed token is soft-revoked (`revoked_at` timestamp) and a new row is inserted atomically using `SELECT ... FOR UPDATE`. Replay of a revoked token triggers a full token-family revocation (`revoke_all_user_tokens`) as a theft-response measure. Multi-device usage is supported by allowing multiple active refresh token rows per user.

**Password hashing** uses Argon2id via the `argon2-cffi` library. Argon2id is the PHC winner and is memory-hard, making GPU/ASIC brute-force significantly more expensive than bcrypt or PBKDF2.

**Frontend CSRF storage** uses a module-level variable in `http.ts` — not React state (which would cause unnecessary re-renders) and not `localStorage` (which would be XSS-accessible and defeat the purpose of httpOnly cookies). The module variable survives component remounts and is read/written exclusively by `authService` via `setCsrfToken`/`clearCsrfToken`. On a page reload, `hydrateCsrfTokenFromCookie()` reads the non-httpOnly CSRF cookie to reseed the variable before the first mutating request.

**Single-flight refresh** prevents duplicate refresh calls when multiple in-flight requests receive a 401 simultaneously. A module-level `refreshInFlight` promise is shared across all concurrent callers; the second caller awaits the existing promise rather than firing a second refresh.

**Cookie settings** are fully env-driven (`COOKIE_SECURE`, `COOKIE_SAMESITE`, `COOKIE_DOMAIN`, `COOKIE_HTTPONLY`). Production defaults: `SameSite=lax`, `Secure=true`, domain `.stima.odysian.dev`. A pydantic model validator rejects `SameSite=none` unless `Secure=true` is also set. A field validator rejects `SECRET_KEY` values shorter than 32 characters or matching known placeholder strings.

---

## Consequences

**Security:**
- XSS cannot steal access or refresh tokens — httpOnly cookies are the only transport.
- CSRF attacks are blocked by the double-submit check on all mutating authenticated endpoints.
- Refresh token replay causes full token-family revocation, limiting the blast radius of a stolen token.
- Argon2id password hashing is resistant to GPU-accelerated brute force.
- `SECRET_KEY` guardrails prevent weak or placeholder JWT signing keys from reaching any environment.

**Maintainability:**
- Any new mutating authenticated endpoint must add `Depends(require_csrf)`. This is enforced by the review checklist but not statically by the type system.
- CSRF token lifecycle is centralized in `http.ts` (`setCsrfToken`/`clearCsrfToken`) and `authService`. Components must not touch CSRF state directly.
- Tests that exercise `request()` directly must call `clearCsrfToken()` in `afterEach` to prevent state leakage across tests.
- MSW-based integration tests cannot rely on `Set-Cookie` in jsdom; two strategies cover the test matrix: in-memory CSRF from response body (normal flows) and manual `document.cookie` writes (reload simulation).

**Performance:**
- Every DB-backed refresh involves one `SELECT ... FOR UPDATE` and one `INSERT` in the same transaction — acceptable for a low-frequency operation on 30-day tokens.
- The `stima_access_token` is path-scoped to `/api/`, so it is not sent on static asset requests.
- The `stima_refresh_token` is scoped to `/api/auth/`, so it is only sent to the auth subdirectory, minimizing unnecessary cookie transmission.

**Revisit triggers:**
- If Stima moves to a truly cross-origin topology (separate apex domains for frontend and API), `SameSite=lax` no longer applies and the refresh token cookie would need `SameSite=none; Secure`. The current env-driven cookie config supports this without code changes.
- If stateless revocation checking becomes necessary at scale (e.g., high-traffic refresh volume saturating DB connection pool), a short-lived blocklist (Redis) could replace or complement the DB soft-revoke approach.
- If `/api/auth/csrf` bootstrap endpoint is added in a future slice, the `hydrateCsrfTokenFromCookie` fallback path in `http.ts` can be removed in favour of an explicit preflight call.
