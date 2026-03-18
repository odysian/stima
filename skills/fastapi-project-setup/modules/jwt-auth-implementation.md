# Module: JWT Auth Implementation

Implement cookie-based JWT auth with refresh rotation and CSRF protection.

## Required Auth Model

- Access token: JWT in httpOnly cookie (`access_token`).
- Refresh token: opaque random token in DB + httpOnly cookie (`refresh_token`).
- CSRF token: non-httpOnly value returned in response body (`csrf_token`) and mirrored by cookie.
- Bearer fallback: accepted for docs and external clients.

## Backend Required Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## Backend Required Utilities

- Access token create/decode with `PyJWT`.
- Refresh token create/validate/rotate backed by DB row.
- Cookie helpers to set/clear access, refresh, csrf cookies.
- Dependency to extract current user from cookie or Bearer header.
- CSRF dependency for mutating cookie-auth requests.

Use templates in `../templates/jwt-auth/`.

## Frontend Required Behavior

- Always call API with `credentials: "include"`.
- Save only `csrf_token` client-side (for cross-domain CSRF header echo).
- On `401`, attempt one refresh, retry once, then clear local auth markers and redirect.

## Security Decisions

- Exempt login/register from CSRF checks (credential-gated endpoints).
- Enforce CSRF checks on cookie-auth mutating routes.
- Use timing-safe comparison for CSRF cookie/header match.
- Include login timing defense (dummy verify for unknown users).

## Test Matrix

- Login sets cookies and returns expected token body.
- `/me` works via cookie and via Bearer fallback.
- Refresh rotates token; old refresh token reuse fails.
- Missing/mismatched CSRF header returns `403` for cookie-auth mutating route.
- Logout clears cookies and invalidates refresh token.
