# SPEC-001C — Native Auth & HTTP Layer

**Parent umbrella:** `plans/react-native/SPEC-001-rn-expo-rewrite.md`
**Phase:** 1 Foundation
**Effort:** 4–5 days

## Goal

Add a bearer-token auth flow suitable for React Native, while keeping the existing cookie+CSRF web auth untouched.

## Decision Lock

Mobile auth uses short-lived JWT access tokens plus opaque, server-stored refresh-token rotation stored in SecureStore. Cookie + CSRF auth remains unchanged for the PWA. Shared auth dependencies must resolve users from either the access cookie or the `Authorization: Bearer` header, and CSRF enforcement must remain in place for cookie-auth web endpoints while bypassing CSRF for bearer-auth mobile requests.

## References

- `frontend/src/shared/lib/http.ts` — `request()`, CSRF token management, cookie hydration, auth failure signaling.
- `frontend/src/features/auth/hooks/useAuth.ts` — Auth context, bootstrap flow, offline recovery, reverify logic.
- `frontend/src/features/auth/services/authService.ts` — Login, register, me, logout, refresh.
- `frontend/src/features/auth/offline/offlineUserSnapshot.ts` — Local auth caching for offline recovery.
- `frontend/src/features/auth/offline/authBootstrapErrors.ts` — Error classification (explicit auth failure vs. network).
- `backend/app/features/auth/api.py` — Current cookie-based login, refresh, logout, me endpoints.
- `backend/app/features/auth/service.py` — Auth service with JWT token creation/rotation.
- `backend/app/shared/dependencies.py` — Current cookie-only `get_current_user()` and unconditional `require_csrf()` behavior.

## Acceptance Criteria

- [ ] Backend exposes additive mobile endpoints: `POST /api/auth/mobile-login`, `POST /api/auth/mobile-refresh`, `POST /api/auth/mobile-logout`, `GET /api/auth/mobile-me`.
- [ ] Mobile login/refresh returns `{ access_token, refresh_token }`, where `access_token` is a short-lived JWT and `refresh_token` is an opaque, server-stored, rotated token. No CSRF token for mobile.
- [ ] Mobile client stores refresh token in `expo-secure-store` (keychain-backed). Access token can be kept in memory or SecureStore.
- [ ] HTTP wrapper (`apiClient.ts`) sends `Authorization: Bearer <access_token>` on every request.
- [ ] Shared backend auth dependencies accept bearer auth for existing protected API routes; mobile clients can call quote/customer/invoice/profile/catalog/job endpoints without cookie hydration.
- [ ] CSRF enforcement becomes auth-mode aware: still required for cookie-auth web requests, not required for bearer-auth mobile requests.
- [ ] Refresh token is rotated server-side on every refresh call; consumed token is revoked.
- [ ] Automatic token refresh on 401: intercept 401, call mobile-refresh with stored refresh token, retry original request, or logout if refresh fails.
- [ ] Offline auth recovery: if NetInfo reports offline on bootstrap, restore user snapshot from SecureStore and enter `offline_recovered` mode.
- [ ] Auth context exposes same interface as current `useAuth`: `user`, `authMode`, `isLoading`, `isOnboarded`, `login`, `register`, `logout`, `refreshUser`.
- [ ] Logout policy decision: on logout, wipe all user-local capture data (capture sessions, audio clips, outbox jobs, drafts) from SQLite and filesystem, or explicitly document and justify preserving pending captures for offline recovery after re-login.

## Backend Contract Notes

- The existing cookie session endpoints (`/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/me`) remain intact for the PWA.
- Mobile endpoints are additive, but implementation scope also includes shared dependency changes so existing protected routes can authenticate via `Authorization` headers without weakening cookie-auth behavior.
- This spec must not silently broaden public access or remove CSRF from browser-cookie flows.
