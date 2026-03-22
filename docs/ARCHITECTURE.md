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
  features/customers/ — customer select/create screen + services/types/tests
  features/profile/ — onboarding form + profile service/types/tests
  features/settings/ — settings screen for profile edits + sign out
  features/quotes/  — quote extraction + quote CRUD
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
| business_name | String(255) | nullable (onboarding) |
| trade_type | String(50) | nullable (onboarding enum string) |
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

### `customers`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | indexed, cascade delete |
| name | String(255) | required |
| phone | String(30) | nullable |
| email | String(320) | nullable |
| address | Text | nullable |
| created_at, updated_at | DateTime(tz) | server defaults |

### `documents`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | indexed, cascade delete |
| customer_id | UUID (FK → customers) | indexed, cascade delete |
| doc_type | String(20) | default `"quote"` |
| doc_sequence | Integer | per-user sequence counter |
| doc_number | String(20) | stored display ID, format `Q-001` |
| status | String(20) | `draft \| ready \| shared` with DB check constraint |
| source_type | String(20) | `"text"` or `"voice"` based on capture mode |
| transcript | Text | raw typed notes |
| total_amount | Numeric(10,2) | nullable, user-editable |
| notes | Text | nullable, customer-facing notes |
| pdf_url | Text | nullable (future PDF task) |
| shared_at | DateTime(tz) | nullable (future sharing task) |
| created_at, updated_at | DateTime(tz) | server defaults |

Unique constraint: `(user_id, doc_sequence)`.

### `line_items`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| document_id | UUID (FK → documents) | indexed, cascade delete |
| description | Text | required |
| details | Text | nullable |
| price | Numeric(10,2) | nullable (`null` means not stated) |
| sort_order | Integer | deterministic display order |
| created_at, updated_at | DateTime(tz) | server defaults |

## API Contracts

### Auth endpoints (`/api/auth/`)

| Endpoint | Method | Rate Limit | CSRF | Auth | Request | Response |
|---|---|---|---|---|---|---|
| `/register` | POST | 3/hr | no | no | `{ email, password }` | `201 { user: { id, email, is_active, is_onboarded } }` |
| `/login` | POST | 5/min | no | no | `{ email, password }` | `200 { user: { id, email, is_active, is_onboarded }, csrf_token }` + sets cookies |
| `/refresh` | POST | 10/min | yes | cookie | — | `200 { user: { id, email, is_active, is_onboarded }, csrf_token }` + rotates cookies |
| `/logout` | POST | 10/min | yes | cookie | — | `204` + clears cookies |
| `/me` | GET | — | no | cookie | — | `200 { id, email, is_active, is_onboarded }` |

### Profile endpoints (`/api/profile`)

| Endpoint | Method | CSRF | Auth | Request | Response |
|---|---|---|---|---|---|
| `/profile` | GET | no | cookie | — | `200 { id, email, first_name, last_name, business_name, trade_type, is_active, is_onboarded }` |
| `/profile` | PATCH | yes | cookie | `{ business_name, first_name, last_name, trade_type }` | `200` with updated profile payload |

### Customer endpoints (`/api/customers`)

| Endpoint | Method | CSRF | Auth | Request | Response |
|---|---|---|---|---|---|
| `/customers` | GET | no | cookie | — | `200 Customer[]` (authenticated user's customers only) |
| `/customers` | POST | yes | cookie | `{ name, phone?, email?, address? }` | `201 Customer` |
| `/customers/{id}` | GET | no | cookie | — | `200 Customer` or `404 { detail: "Not found" }` |
| `/customers/{id}` | PATCH | yes | cookie | partial `{ name?, phone?, email?, address? }` | `200 Customer` or `404 { detail: "Not found" }` |

### Quote extraction + CRUD endpoints (`/api/quotes`)

#### `ExtractionResult` contract (flat, no envelope)

```json
{
  "transcript": "string",
  "line_items": [
    {
      "description": "string",
      "details": "string | null",
      "price": "number | null",
      "flagged": "boolean (optional, default false)",
      "flag_reason": "string | null (optional, extraction-only)"
    }
  ],
  "total": "number | null",
  "confidence_notes": ["string"]
}
```

Rules:
- `line_items` is always an array (may be empty).
- Missing prices remain `null` (never auto-filled to `0`).
- `total` is nullable (`null` = not stated).
- `flagged` and `flag_reason` are extraction-only review hints.
- Extraction-only fields are stripped before `POST /quotes` and `PATCH /quotes/{id}` payloads.

| Endpoint | Method | CSRF | Auth | Request | Response |
|---|---|---|---|---|---|
| `/quotes/convert-notes` | POST | yes | cookie | `{ notes }` | `200 ExtractionResult` |
| `/quotes/capture-audio` | POST | yes | cookie | multipart form-data `clips` files | `200 ExtractionResult` |
| `/quotes/extract` | POST | yes | cookie | multipart form-data `clips?` files + `notes?` string | `200 ExtractionResult` |
| `/quotes` | POST | yes | cookie | `{ customer_id, transcript, line_items, total_amount, notes, source_type }` | `201 Quote` with `doc_number` (`Q-001`) and `status: "draft"` |
| `/quotes` | GET | no | cookie | — | `200 QuoteListItem[]` ordered `created_at DESC, doc_sequence DESC` (owned by current user) |
| `/quotes/{id}` | GET | no | cookie | — | `200 Quote` or `404 { detail: "Not found" }` |
| `/quotes/{id}` | PATCH | yes | cookie | partial `{ line_items?, total_amount?, notes? }` | `200 Quote` or `404 { detail: "Not found" }` |

`PATCH /quotes/{id}` behavior:
- If `line_items` is present, existing rows are fully replaced.
- If `line_items` is omitted, existing rows are preserved.

`QuoteListItem` fields:
- `id`
- `customer_id`
- `customer_name`
- `doc_number`
- `status`
- `total_amount`
- `created_at`

### Error format
```json
{ "detail": "Human-readable error message" }
```
FastAPI validation errors use `422` with array-style `detail`.

## Frontend Auth Architecture

- **`http.ts`**: shared fetch wrapper. Handles `credentials: 'include'`, CSRF header injection, JSON serialization, single-flight refresh, error parsing.
- **`authService.ts`**: thin service layer calling `request()`. Owns `setCsrfToken`/`clearCsrfToken` lifecycle.
- **`useAuth.ts`**: `AuthProvider` bootstraps session via `GET /me` on mount. Exposes `{ user, isLoading, isOnboarded, refreshUser, login, register, logout }` via context. Shows `LoadingScreen` during bootstrap.
- **`ProtectedRoute`**: unauthenticated users are redirected to `/login`; authenticated users with `is_onboarded: false` are redirected to `/onboarding`.
- **`OnboardingRoute`**: unauthenticated users are redirected to `/login`; already-onboarded users are redirected to `/`.

## Deployment

TBD — not yet deployed.
