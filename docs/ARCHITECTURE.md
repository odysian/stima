# Architecture

## Overview

**Backend**: FastAPI (async) + SQLAlchemy 2.0 (async) + PostgreSQL + Alembic migrations.
**Frontend**: React SPA (Vite + TypeScript) proxied to backend via Vite dev server.
**Production topology**: same-site subdomains under `stima.odysian.dev` with cookie domain `.stima.odysian.dev`.

### Backend layout
```
backend/app/
  core/          — config, database, security primitives
  features/      — feature modules (auth, quotes, customers, profile)
    registry.py  — central model import for Alembic discovery
  shared/        — cross-cutting: dependencies, rate limiting, exceptions
  integrations/  — external service adapters (audio, transcription, pdf)
```

### Frontend layout
```
frontend/src/
  shared/lib/       — http transport, api types
  shared/components/ — Button, Input, LoadingScreen
  shared/tests/     — MSW server, handlers, setup
  features/auth/    — auth types, services, hooks, components, tests
  features/quotes/  — quote capture/review (stubbed)
```

## Auth Model

Cookie-based authentication with CSRF double-submit and refresh token rotation.

**Tokens**: access (JWT, 15min, httpOnly cookie scoped to `/api/`), refresh (opaque, 30d, httpOnly cookie scoped to `/api/auth/`), CSRF (non-httpOnly cookie scoped to `/`, also returned in JSON body).

**Flow**: register → login → access+refresh+csrf cookies set → authenticated requests carry cookies automatically → mutating requests include `X-CSRF-Token` header → on 401, frontend attempts one refresh → refresh rotates token and soft-revokes consumed token → on refresh failure, session clears.

**Security**: Argon2id password hashing. Refresh token stored as SHA-256 hash. Replay of revoked token revokes entire token family. Rate limiting on all auth endpoints. Proxy-aware IP extraction for rate limiting.

**Multi-device**: multiple active refresh tokens per user are allowed.

## Database Schema

### `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| email | String(320) | unique, indexed |
| password_hash | String(512) | Argon2id |
| first_name | String(100) | nullable (onboarding) |
| last_name | String(100) | nullable (onboarding) |
| phone_number | String(30) | nullable (onboarding) |
| is_active | Boolean | default true |
| created_at, updated_at | DateTime(tz) | server defaults |

### `refresh_tokens`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | indexed, cascade delete |
| token_hash | String(64) | SHA-256, unique, indexed |
| expires_at | DateTime(tz) | |
| created_at | DateTime(tz) | server default |
| revoked_at | DateTime(tz) | nullable, soft-revoke |

## API Contracts

### Auth endpoints (`/api/auth/`)

| Endpoint | Method | Rate Limit | CSRF | Auth | Request | Response |
|---|---|---|---|---|---|---|
| `/register` | POST | 3/hr | no | no | `{ email, password }` | `201 { user: { id, email, is_active } }` |
| `/login` | POST | 5/min | no | no | `{ email, password }` | `200 { user: { id, email, is_active }, csrf_token }` + sets cookies |
| `/refresh` | POST | 10/min | yes | cookie | — | `200 { user: { id, email, is_active }, csrf_token }` + rotates cookies |
| `/logout` | POST | 10/min | yes | cookie | — | `204` + clears cookies |
| `/me` | GET | — | no | cookie | — | `200 { id, email, is_active }` |

### Error format
```json
{ "detail": "Human-readable error message" }
```
FastAPI validation errors use `422` with array-style `detail`.

## Frontend Auth Architecture

- **`http.ts`**: shared fetch wrapper. Handles `credentials: 'include'`, CSRF header injection, JSON serialization, single-flight refresh, error parsing.
- **`authService.ts`**: thin service layer calling `request()`. Owns `setCsrfToken`/`clearCsrfToken` lifecycle.
- **`useAuth.ts`**: `AuthProvider` bootstraps session via `GET /me` on mount. Exposes `{ user, isLoading, login, register, logout }` via context. Shows `LoadingScreen` during bootstrap.
- **`ProtectedRoute`**: redirects to `/login` with return-path state when unauthenticated. Public routes redirect authenticated users to `/`.

## Deployment

TBD — not yet deployed.
