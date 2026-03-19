# ADR-003: Module-Level CSRF State in Frontend Transport

**Date:** 2026-03-19
**Status:** Accepted
**Spec/Task:** #1 (Spec: Auth Foundation), #4 (Task 3: Frontend Auth Flow), #5 (Task 4: Integration/MSW Regression)

---

## Context

ADR-001 established that Stima uses cookie-based auth with httpOnly access/refresh tokens and a non-httpOnly CSRF token for double-submit protection. Mutating requests must echo the CSRF token as an `X-CSRF-Token` header. The backend validates that the cookie value and header value match.

The CSRF token arrives in JavaScript via two paths:

1. **Post-login/refresh JSON body** — `login` and `refresh` return `{ csrf_token: "..." }` in the response. The frontend reads this and must store it for subsequent requests in the same session.
2. **Non-httpOnly cookie on page reload** — the `stima_csrf_token` cookie persists across reloads. Because it is non-httpOnly, JavaScript can read it via `document.cookie` to reseed in-memory state before the first mutating request.

The transport layer (`src/shared/lib/http.ts`) must:
- Read the current CSRF token on every mutating request (`POST`, `PUT`, `PATCH`, `DELETE`).
- Update the token when a new value arrives after a token rotation (the `refresh` response returns a fresh CSRF token that must be used on the replayed request).
- Clear the token on logout or refresh failure so subsequent requests do not carry a stale or invalid token.
- Handle the page-reload case where the in-memory value has been lost but the cookie persists.

The central question is: **where does the CSRF token live while the SPA is running?**

---

## Options Considered

### Option A: React state (inside `AuthProvider`)

Store the CSRF token as a React `useState` value inside `AuthProvider`, alongside `user`. Pass it to the transport layer via a ref or expose a setter via context.

**Pros:**
- Follows standard React data-flow conventions.
- CSRF token lifecycle is naturally tied to the component lifecycle — unmounting `AuthProvider` clears the token automatically.
- Readable in the component tree if any component ever needed to inspect it directly.

**Cons:**
- `http.ts` is a framework-agnostic transport module. If it needs to read or write CSRF state owned by a React component, it must import from a React context or accept a callback injected from the component tree — inverting the dependency direction (UI framework → transport layer). This creates tight coupling that makes `http.ts` harder to test and reuse.
- Any CSRF token update (e.g., after a token rotation on refresh) would trigger a re-render of the entire `AuthProvider` subtree, even though no visible UI depends on the CSRF token value.
- The single-flight refresh guard (`refreshInFlight`) already lives as a module-level variable in `http.ts`. Keeping the token in React state while the refresh promise lives in the module creates a split-brain: the transport layer has to coordinate with an external state system synchronously in the middle of an async `await` chain.
- During the replayed request immediately after a successful refresh, the refreshed CSRF token must be available synchronously. React state updates are asynchronous and do not take effect until the next render cycle — the replayed request could be dispatched with the stale token.

### Option B: `localStorage` or `sessionStorage`

Write the CSRF token to `localStorage` (persists across reloads) or `sessionStorage` (cleared when the tab closes). Read it back on every mutating request.

**Pros:**
- `localStorage` survives page reloads without any cookie-reading fallback.
- Simple API — no module exports or lifecycle management needed.

**Cons:**
- Contradicts the XSS mitigation rationale behind httpOnly cookies. The entire reason access and refresh tokens are httpOnly is to prevent JavaScript from reading them. If the CSRF token is in `localStorage`, XSS code running on the same origin can read it via `localStorage.getItem('csrf_token')` and use it to make CSRF-protected API calls. While the CSRF token alone is not sufficient to impersonate a session (the attacker also needs the httpOnly cookies, which XSS cannot access), exposing the CSRF token in `localStorage` weakens the security model unnecessarily and provides an XSS attacker with a component they would otherwise have to work harder to obtain.
- `sessionStorage` does not survive page reloads, causing CSRF state loss on every reload and creating silent broken-request bugs where mutating calls succeed without the header (because the header is omitted when the token is missing, not because a zero-length value is sent).
- Storage APIs are slower than a module variable and introduce observable async-like behavior in synchronous-looking code.

### Option C: Module-level variable in `http.ts` (chosen)

Declare `let csrfToken: string | null = null` directly at module scope in `http.ts`. Expose named exports `setCsrfToken(token: string)` and `clearCsrfToken()` for lifecycle management. On page reload, call `hydrateCsrfTokenFromCookie()` to read the non-httpOnly `stima_csrf_token` cookie and reseed the variable before the first mutating request.

**Pros:**
- `http.ts` remains framework-agnostic. No React imports. The transport layer owns its own state.
- Zero re-renders — React components that do not depend on the CSRF token are unaffected by token rotation.
- The in-memory variable is updated synchronously. When `setCsrfToken(authResponse.csrf_token)` is called inside `requestRefresh()`, the very next `request<T>(url, { skipRefresh: true })` replay sees the rotated token immediately, within the same microtask chain. There is no render cycle between token update and token use.
- Survives React component remounts. If `AuthProvider` unmounts and remounts (e.g., in tests or hot reload), the CSRF token is not lost.
- The `refreshInFlight` single-flight promise already uses the same module-level pattern. Keeping both pieces of transport state in the same module is consistent.
- The cookie fallback (`hydrateCsrfTokenFromCookie`) correctly handles the page-reload case: the non-httpOnly cookie persists, so the module variable can be reseeded lazily on the first mutating request after reload.

**Cons:**
- Module-level state is invisible to React's lifecycle and the test runner's per-test isolation. Tests that call `request()` directly must call `clearCsrfToken()` in `afterEach` to prevent state leakage across test cases.
- Module state is global for the SPA's lifetime. There is no automatic cleanup tied to the application component tree, only the explicit `clearCsrfToken()` call on logout and on refresh failure.
- The page-reload bootstrap requires `hydrateCsrfTokenFromCookie()` as an explicit step. If the CSRF cookie has expired or was never set (e.g., in a clean test environment), the variable stays null and mutating requests are sent without the header — which is the correct behavior since the user has no active session, but it requires test authors to understand the cookie-read path.

---

## Decision

**Module-level variable in `http.ts` (Option C).**

The transport layer must remain framework-agnostic. Coupling `http.ts` to React state (Option A) inverts the dependency direction in a way that breaks the module's ability to be tested independently and makes the single-flight refresh logic awkward. `localStorage` (Option B) contradicts the XSS mitigation rationale and is not a meaningful improvement over reading the non-httpOnly cookie directly.

The module-level variable provides the right trade-off: synchronous reads and writes in the middle of async chains, no framework coupling, no re-renders, and a clean cookie-read fallback for page-reload scenarios.

**Lifecycle ownership** is assigned exclusively to `authService`:
- `login` calls `setCsrfToken(response.csrf_token)`.
- `register` does **not** call `setCsrfToken` — the register endpoint does not return a CSRF token (no authenticated session is established at registration time).
- `logout` calls `clearCsrfToken()` after the logout request succeeds.
- `requestRefresh` (inside `http.ts`) calls `setCsrfToken(authResponse.csrf_token)` after a successful refresh and calls `clearCsrfToken()` if the refresh fails.

Components must never call `setCsrfToken` or `clearCsrfToken` directly.

**Page-reload hydration** uses `hydrateCsrfTokenFromCookie()`, called lazily inside `request()` before the first mutating request when `csrfToken` is null, and also inside `requestRefresh()` before sending the refresh POST. The non-httpOnly `stima_csrf_token` cookie is the persistent source of truth across page reloads; the module variable is the in-session working copy.

**Rotated token on replay** is the security-critical path: after `requestRefresh()` resolves, it has called `setCsrfToken(authResponse.csrf_token)` with the new token. The replayed request then calls `buildHeaders()`, which reads the now-updated `csrfToken`. This is covered by the `"uses the rotated CSRF token from refresh on the replayed request"` test in `http.test.ts`.

---

## Consequences

**Security:**
- XSS cannot access the module variable through `localStorage.getItem` or `sessionStorage.getItem` APIs. However, XSS code running on the same origin exists in the same JavaScript heap and could call the exported `setCsrfToken` or `clearCsrfToken` functions — this is accepted because any XSS code could also intercept `fetch` calls directly. Module-level variables provide no stronger XSS boundary than React state; both live in the same runtime. The defense-in-depth posture is httpOnly cookies for tokens, not module scope for CSRF.
- The non-httpOnly CSRF cookie is readable by XSS. This is intrinsic to the double-submit pattern: the cookie must be readable so the browser allows JavaScript to echo it in a header. The pattern defends against cross-origin CSRF, not against same-origin XSS.
- `clearCsrfToken()` on refresh failure and on logout ensures a stale or invalidated CSRF token is not silently sent on subsequent requests.

**Maintainability:**
- Every test file that exercises `request()` directly (not through a mocked `authService`) must call `clearCsrfToken()` in `afterEach`. Failure to do so leaks CSRF state between test cases, causing order-dependent test failures.
- Similarly, if a test sets `document.cookie` for the CSRF cookie, it must clear it in `afterEach` to prevent `hydrateCsrfTokenFromCookie()` from reseeding the variable in a later test.
- `authService` is the single owner of the CSRF token lifecycle. Adding a new auth endpoint that establishes or rotates a session must go through `authService` and must call the appropriate lifecycle function.
- MSW-based integration tests cannot rely on `Set-Cookie` headers in jsdom — MSW cookies don't persist in the jsdom cookie jar. The two-track test strategy (in-memory CSRF from the response body for normal flows; manual `document.cookie` writes for reload simulation) covers this limitation.

**Performance:**
- CSRF token reads and writes are synchronous module variable accesses — effectively free.
- Zero React re-renders occur as a result of CSRF token rotation. The only re-render triggered by an auth event is when `AuthProvider` updates `user` state (e.g., after logout sets `user` to null), which is a separate state variable.

**Revisit triggers:**
- If Stima adopts server-side rendering (SSR), module-level variables are problematic: in a Node.js SSR server, ES modules are cached across requests, so the variable would be shared across all incoming requests unless the module is explicitly re-evaluated per request. SSR would require replacing the module variable with a per-request store (e.g., React's `AsyncLocalStorage` or a context passed through the render call).
- If a `/api/auth/csrf` bootstrap endpoint is added in a future slice (explicitly out of scope for Slice 0 per the spec), the `hydrateCsrfTokenFromCookie()` fallback path can be removed and replaced with an explicit preflight call on application bootstrap. This would also remove the dependency on the non-httpOnly cookie being readable by JavaScript.
- If the frontend adopts micro-frontend composition with separate webpack/Vite runtime boundaries (module federation), different micro-frontend bundles would each have their own copy of `http.ts`'s module scope. CSRF state set in one bundle would be invisible to another bundle's `request()` calls. In that case, a shared singleton store (e.g., a cross-bundle event bus or a shared atom) would be required.
