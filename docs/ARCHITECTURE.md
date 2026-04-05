# Architecture

## Overview

**Backend**: FastAPI (async) + SQLAlchemy 2.0 (async) + PostgreSQL + Alembic migrations.
**Frontend**: React SPA (Vite + TypeScript) proxied to backend via Vite dev server.
**Production topology**: same-site subdomains under `stima.odysian.dev` with cookie domain `.stima.odysian.dev`.

### Backend layout
```
backend/app/
  admin/         — internal-only API-key routes excluded from public schema
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

**Security**: Argon2id password hashing. Refresh token stored as SHA-256 hash. Replay of revoked token revokes entire token family. Redis-backed distributed rate limiting protects auth, public document, PDF/email, and extraction routes; public routes stay IP-keyed while authenticated hot paths use per-user keys. Provider-backed extraction routes also enforce Redis-backed per-user daily quota and concurrency guards before upstream calls. Proxy-aware IP extraction remains the fallback key source for unauthenticated routes.

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
| timezone | String(64) | nullable IANA timezone identifier used for quote-facing date rendering |
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
| doc_sequence | Integer | per-user, per-`doc_type` sequence counter |
| doc_number | String(20) | stored display ID, format `Q-001` or `I-001` |
| title | String(120) | nullable optional document label shown in detail views and PDFs |
| source_document_id | UUID (self-FK → documents.id) | nullable, `ON DELETE SET NULL`; invoice rows use this for immutable quote lineage |
| status | String(20) | `draft \| ready \| shared \| viewed \| approved \| declined \| sent` with DB check constraint; `sent` is invoice-only |
| source_type | String(20) | `"text"` or `"voice"` based on capture mode |
| transcript | Text | stored source transcript/notes inherited from capture flow |
| total_amount | Numeric(10,2) | nullable, user-editable |
| notes | Text | nullable, customer-facing notes |
| due_date | Date | nullable; used by invoice documents |
| pdf_url | Text | nullable legacy field; PDFs are streamed directly in V0 and this is not populated by the current flow |
| share_token | Text | nullable, unique, set on first active share and reused until regenerated explicitly or rotated automatically when revoked/expired |
| shared_at | DateTime(tz) | nullable, set when a quote transitions to `shared` or an invoice transitions to `sent` |
| share_token_created_at | DateTime(tz) | nullable, set when the current active share token is minted |
| share_token_expires_at | DateTime(tz) | nullable, defaults to `share_token_created_at + PUBLIC_SHARE_LINK_EXPIRE_DAYS` (`90` by default) |
| share_token_revoked_at | DateTime(tz) | nullable, marks the current token unusable without exposing that state publicly |
| last_public_accessed_at | DateTime(tz) | nullable, updated on successful public JSON/PDF document loads |
| invoice_first_viewed_at | DateTime(tz) | nullable, set exactly once on the first successful public invoice landing-page load |
| created_at, updated_at | DateTime(tz) | server defaults |

Unique constraints:
- `(user_id, doc_type, doc_sequence)`
- partial unique invoice-source index on `source_document_id` where `doc_type = 'invoice'`

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

### `event_logs`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | cascade delete |
| event_name | String(64) | pilot event name, underscore format |
| metadata_json | JSON | lightweight `quote_id`, `invoice_id`, `customer_id`, `detail` payload |
| created_at | DateTime(tz) | server default |

Pilot event set:
- `quote_started`
- `audio_uploaded`
- `draft_generated`
- `draft_generation_failed`
- `quote_pdf_generated`
- `quote_shared`
- `quote_approved`
- `quote_marked_lost`
- `quote_viewed`
- `email_sent`
- `invoice_created`
- `invoice_viewed`

These underscore names are the canonical quote-flow vocabulary for pilot instrumentation; dot-notation events such as `quote.created`, `quote.updated`, `quote.deleted`, and `customer.created` remain separate operational logs outside the pilot analytics scope.

Internal analytics access:
- `GET /api/admin/events?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&event_name?=...`
- Route is registered only when `ADMIN_API_KEY` is set.
- Requests require `X-Admin-Key`; absent or invalid keys both return `401`.
- Results are aggregated by `event_name` and UTC calendar day.
- Route is excluded from OpenAPI (`include_in_schema=False`).

## API Contracts

### Auth endpoints (`/api/auth/`)

| Endpoint | Method | Rate Limit | CSRF | Auth | Request | Response |
|---|---|---|---|---|---|---|
| `/register` | POST | 3/hr | no | no | `{ email, password }` | `201 { user: { id, email, is_active, is_onboarded, timezone } }` |
| `/login` | POST | 5/min | no | no | `{ email, password }` | `200 { user: { id, email, is_active, is_onboarded, timezone }, csrf_token }` + sets cookies |
| `/refresh` | POST | 10/min | yes | cookie | — | `200 { user: { id, email, is_active, is_onboarded, timezone }, csrf_token }` + rotates cookies |
| `/logout` | POST | 10/min | yes | cookie | — | `204` + clears cookies |
| `/me` | GET | — | no | cookie | — | `200 { id, email, is_active, is_onboarded, timezone }` |

### Profile endpoints (`/api/profile`)

| Endpoint | Method | CSRF | Auth | Request | Response |
|---|---|---|---|---|---|
| `/profile` | GET | no | cookie | — | `200 { id, email, first_name, last_name, business_name, trade_type, timezone, has_logo, is_active, is_onboarded }` |
| `/profile` | PATCH | yes | cookie | `{ business_name, first_name, last_name, trade_type, timezone? }` | `200` with updated profile payload |
| `/profile/logo` | POST | yes | cookie | multipart form-data `file` | `200` with updated profile payload (`has_logo: true`) |
| `/profile/logo` | GET | no | cookie | — | `200` raw image bytes with correct `Content-Type` + `Cache-Control: no-store`, or `404 { detail: "Logo not found" }` |
| `/profile/logo` | DELETE | yes | cookie | — | `204`, or `404 { detail: "Logo not found" }` |

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
| `/quotes` | POST | yes | cookie | `{ customer_id, title?, transcript, line_items, total_amount, notes, source_type, tax_rate?, discount_type?, discount_value?, deposit_amount? }` | `201 Quote` with `doc_number` (`Q-001`) and `status: "draft"` |
| `/quotes` | GET | no | cookie | `customer_id?` (UUID query param) | `200 QuoteListItem[]` ordered `created_at DESC, doc_sequence DESC` (owned by current user; filtered to customer when `customer_id` provided; quote rows only where `doc_type = 'quote'`) |
| `/quotes/{id}` | GET | no | cookie | — | `200 QuoteDetailResponse` (`Quote` + `customer_name`, `customer_email`, `customer_phone`, `linked_invoice`) or `404 { detail: "Not found" }` |
| `/quotes/{id}` | PATCH | yes | cookie | partial `{ title?, line_items?, total_amount?, notes?, tax_rate?, discount_type?, discount_value?, deposit_amount? }` | `200 Quote` for `draft`, `ready`, `shared`, `viewed`, `approved`, and `declined` quotes, or `404 { detail: "Not found" }` |
| `/quotes/{id}/share` | POST | yes | cookie | `regenerate?` (bool query, default `false`) | `200 Quote`; creates/reuses the active `share_token`, regenerates when requested or when the existing token is expired/revoked, and preserves terminal quote status on resend |
| `/quotes/{id}/share` | DELETE | yes | cookie | — | `204`; revokes the current quote share token without leaking token state publicly |
| `/quotes/{id}/send-email` | POST | yes | cookie | header `Idempotency-Key` required | `200 Quote` after ensuring the quote is shared and emailing the customer link; replayed `200` responses include `Idempotency-Replayed: true`; `400` when the idempotency header is missing, `404` when quote is missing/not owned, `409` when still `draft`, when the same key is reused for a different quote, or when the same key is already in progress, `422` when customer email is missing/invalid, `429` when resent within 5 minutes, `502` when the provider send fails, or `503` when email delivery runtime config is missing |
| `/quotes/{id}/mark-won` | POST | yes | cookie | — | `200 Quote`, `404 { detail: "Not found" }`, or `409 { detail: "Unable to update quote outcome" }` on an unexpected write race |
| `/quotes/{id}/mark-lost` | POST | yes | cookie | — | `200 Quote`, `404 { detail: "Not found" }`, or `409 { detail: "Unable to update quote outcome" }` on an unexpected write race |
| `/quotes/{id}/convert-to-invoice` | POST | yes | cookie | — | `201 Invoice`, `404 { detail: "Not found" }`, or `409 { detail: "An invoice already exists for this quote" }` |

Quote extraction guardrails:
- `POST /quotes/convert-notes`, `POST /quotes/capture-audio`, and `POST /quotes/extract` use user-keyed rate limits when a valid access cookie is present, with IP fallback only for unauthenticated resolution failures.
- Those same extraction routes return `429 { "detail": "Extraction quota or concurrency exhausted. Please retry later." }` when the per-user daily quota or concurrent in-flight extraction limit is exhausted before provider work starts.
- `POST /quotes/{id}/pdf`, `POST /quotes/{id}/send-email`, `POST /invoices/{id}/pdf`, and `POST /invoices/{id}/send-email` are also user-keyed and rate-limited.

### Invoice endpoints (`/api/invoices`)

| Endpoint | Method | CSRF | Auth | Request | Response |
|---|---|---|---|---|---|
| `/invoices` | POST | yes | cookie | `{ customer_id, title?, transcript, line_items, total_amount, notes, source_type, tax_rate?, discount_type?, discount_value?, deposit_amount? }` | `201 Invoice` with `doc_number` (`I-001`), `status: "draft"`, server-default `due_date`, and nullable `source_document_id` |
| `/invoices` | GET | no | cookie | `customer_id?` (UUID query param) | `200 InvoiceListItem[]` ordered `created_at DESC, doc_sequence DESC` (owned by current user; filtered to customer when `customer_id` provided; includes both direct invoices and quote-derived invoices) |
| `/invoices/{id}` | GET | no | cookie | — | `200 InvoiceDetail`, `404 { detail: "Not found" }` |
| `/invoices/{id}` | PATCH | yes | cookie | partial `{ title?, line_items?, total_amount?, notes?, due_date?, tax_rate?, discount_type?, discount_value?, deposit_amount? }` | `200 Invoice` for `draft`, `ready`, and `sent` invoices, or `404 { detail: "Not found" }` |
| `/invoices/{id}/pdf` | POST | yes | cookie | — | `200` raw PDF bytes; preview transitions `draft -> ready` |
| `/invoices/{id}/share` | POST | yes | cookie | `regenerate?` (bool query, default `false`) | `200 Invoice`; creates/reuses the active `share_token`, regenerates when requested or when the existing token is expired/revoked, and transitions invoice to `sent` |
| `/invoices/{id}/share` | DELETE | yes | cookie | — | `204`; revokes the current invoice share token without leaking token state publicly |
| `/invoices/{id}/send-email` | POST | yes | cookie | header `Idempotency-Key` required | `200 Invoice` after ensuring the invoice is shared and emailing the customer PDF link; replayed `200` responses include `Idempotency-Replayed: true`; `400` when the idempotency header is missing, `404` when invoice is missing/not owned, `409` when still `draft`, when the same key is reused for a different invoice, or when the same key is already in progress, `422` when customer email is missing/invalid, `429` when resent within 5 minutes, `502` when the provider send fails, or `503` when email delivery runtime config is missing |

### Public document landing endpoints

| Endpoint | Method | Auth | Response |
|---|---|---|---|
| `/api/public/doc/{share_token}` | GET | no | `200 PublicQuoteResponse \| PublicInvoiceResponse` discriminated by `doc_type`; generic `404 { detail: "Not found" }` for unknown, expired, revoked, or non-public tokens |
| `/api/public/doc/{share_token}/logo` | GET | no | raw image bytes with correct `Content-Type`, `Cache-Control: public, max-age=300`, `404 { detail: "Logo not found" }`, or `500 { detail: "Unable to load logo" }`; resolves both quote and invoice tokens |
| `/share/{share_token}` | GET | no | raw quote or sent-invoice PDF bytes with `Content-Type: application/pdf`, `Cache-Control: no-store`, and `X-Robots-Tag: noindex`; generic `404` for unknown, expired, revoked, or non-public tokens |

Public landing-page rules:
- contractor share/copy actions hand out the frontend route `/doc/{share_token}` instead of the raw PDF URL
- transactional quote emails reuse that same `/doc/{share_token}` landing page as the primary CTA and include `/share/{share_token}` as the secondary "Download PDF" link
- the public JSON contract is a discriminated union keyed by `doc_type`:
  - quote variant: `doc_type = "quote"`, `status` in `shared | viewed | approved | declined`
  - invoice variant: `doc_type = "invoice"`, `status = "sent"`, includes `due_date`
- first public load of a `shared` quote transitions it to `viewed` and logs exactly one `quote_viewed` event
- repeat public loads of `viewed`, `approved`, and `declined` quotes are read-only and do not create duplicate `quote_viewed` events
- first public load of a `sent` invoice sets `invoice_first_viewed_at`, logs exactly one `invoice_viewed` event, and does not mutate invoice status
- repeat public loads of a `sent` invoice are read-only and do not create duplicate `invoice_viewed` events
- revoked, expired, and unknown tokens all return the same external `404`; internal logs retain the reason code for revoked/expired cases
- public JSON, logo, and PDF responses are IP-keyed rate-limited and return `429` on limit exhaustion
- public JSON, logo, and PDF responses send `X-Robots-Tag: noindex`

`PATCH /quotes/{id}` behavior:
- If `title` is present, blank or whitespace-only values are normalized to `null`.
- If `title` is omitted, the existing title is preserved.
- If `line_items` is present, existing rows are fully replaced.
- If `line_items` is omitted, existing rows are preserved.
- Editing preserves the persisted quote status and any existing `share_token` / `shared_at` values.
- Shared, viewed, approved, and declined quotes stay editable even though they remain non-deletable customer-visible documents.

`POST /quotes/{id}/send-email` behavior:
- `Idempotency-Key` is mandatory; missing keys return `400 { "detail": "Idempotency-Key header is required" }`.
- Successful same-key retries replay the original `200` response with `Idempotency-Replayed: true` and do not send a second email.
- Reusing the same key for a different quote, or while the original request is still in progress, returns `409`.
- The quote is shared before the provider call, so a `502` or `503` can still leave the quote in `shared` state on a subsequent `GET`.
- Ready, shared, viewed, approved, and declined quotes can all send or resend email without rotating the existing share token; if the existing token is expired or revoked, the share step regenerates a fresh one before delivery.
- The duplicate-send guard allows an immediate retry after provider failure because no `email_sent` throttle event is recorded on failed sends.

`POST /invoices/{id}/send-email` behavior:
- `Idempotency-Key` is mandatory; missing keys return `400 { "detail": "Idempotency-Key header is required" }`.
- Successful same-key retries replay the original `200` response with `Idempotency-Replayed: true` and do not send a second email.
- Reusing the same key for a different invoice, or while the original request is still in progress, returns `409`.
- The invoice is shared before the provider call, so a `502` or `503` can still leave the invoice in `sent` state with a reusable `share_token` on a subsequent `GET`.
- Ready and sent invoices can both send or resend email without rotating the existing share token; if the existing token is expired or revoked, the share step regenerates a fresh one before delivery. Draft invoices are rejected until the PDF is generated.
- Invoice email CTAs now use the public frontend `/doc/{share_token}` landing page as the primary customer route, with `/share/{share_token}` remaining the raw PDF download path.
- The duplicate-send guard allows an immediate retry after provider failure because no `email_sent` throttle event is recorded on failed sends.

`QuoteListItem` fields:
- `id`
- `customer_id`
- `customer_name`
- `doc_number`
- `title`
- `status`
- `total_amount`
- `item_count`
- `created_at`

`InvoiceListItem` fields:
- `id`
- `customer_id`
- `customer_name`
- `doc_number`
- `title`
- `status`
- `total_amount`
- `due_date`
- `created_at`
- `source_document_id`

`QuoteDetailResponse` fields:
- Standard `Quote` fields, including `id`, `customer_id`, `doc_number`, `title`, `status`, `source_type`, `transcript`, `total_amount`, `tax_rate`, `discount_type`, `discount_value`, `deposit_amount`, `notes`, `shared_at`, `share_token`, `line_items`, `created_at`, and `updated_at`
- Customer display fields: `customer_name`, `customer_email`, `customer_phone`
- `linked_invoice`: `{ id, doc_number, status, due_date, total_amount, created_at } | null`

`InvoiceDetail` fields:
- Standard invoice fields: `id`, `customer_id`, `doc_number`, `title`, `status`, `total_amount`, `tax_rate`, `discount_type`, `discount_value`, `deposit_amount`, `notes`, `due_date`, `shared_at`, `share_token`, `source_document_id`, `line_items`, `created_at`, and `updated_at`
- `source_quote_number` (`null` for direct invoices with no parent quote)
- `customer`: `{ id, name, email, phone }`

Invoice rules:
- direct invoices can be created from the shared builder via `POST /api/invoices` without a source quote
- the authenticated `/` route remains the main document list, defaulting to `Quotes` with an `Invoices` secondary filter
- list search stays parallel in both modes (`customer_name`, `title`, `doc_number`)
- quote rows continue to route to `/quotes/{id}/preview`; invoice rows route to `/invoices/{id}`
- direct invoices receive the server-side default due date on create
- direct invoices use `source_document_id = null` and `source_quote_number = null`
- only `approved` quotes can convert to invoices
- quote conversion is one-to-one; duplicate conversions are blocked by service guard plus the DB partial unique index
- invoice lifecycle is `draft -> ready -> sent`
- if `title` is present, blank or whitespace-only values are normalized to `null`
- if `title`, `total_amount`, `notes`, or `due_date` are omitted, the existing persisted values are preserved
- if `line_items` is present, existing rows are fully replaced; if omitted, existing rows are preserved
- editing preserves the persisted invoice status plus any existing `share_token` / `shared_at` values
- editing a `ready` invoice keeps it in `ready`; editing a `sent` invoice keeps it in `sent`
- invoice public landing pages share the same `/doc/{share_token}` route shell as quotes, but render invoice-specific fields (`due_date`, `status = sent`) without quote-only terminal-state messaging

### Error format
```json
{ "detail": "Human-readable error message" }
```
FastAPI validation errors use `422` with array-style `detail`.

## Error Monitoring

- Backend Sentry initialization lives in `backend/app/core/sentry.py` and is enabled only when `SENTRY_DSN` is set.
- Frontend Sentry initialization lives in `frontend/src/sentry.ts` and is enabled only when `VITE_SENTRY_DSN` is set.
- Both SDKs disable default PII capture.
- Frontend transport capture is intentionally narrow: only unhandled render errors, network failures, and `5xx` responses are reported; expected `4xx` responses are not.

## Frontend Auth Architecture

- **`http.ts`**: shared fetch wrapper. Handles `credentials: 'include'`, CSRF header injection, JSON serialization, single-flight refresh, error parsing.
- **`authService.ts`**: thin service layer calling `request()`. Owns `setCsrfToken`/`clearCsrfToken` lifecycle.
- **`useAuth.ts`**: `AuthProvider` bootstraps session via `GET /me` on mount. Exposes `{ user, isLoading, isOnboarded, refreshUser, login, register, logout }` via context. Shows `LoadingScreen` during bootstrap.
- **`ProtectedRoute`**: unauthenticated users are redirected to `/login`; authenticated users with `is_onboarded: false` are redirected to `/onboarding`.
- **`OnboardingRoute`**: unauthenticated users are redirected to `/login`; already-onboarded users are redirected to `/`.

## Deployment

Stima is deployed in production with same-site subdomains:

- Frontend: Vercel at `stima.odysian.dev`
- Backend: GCP VM + NGINX at `api.stima.odysian.dev`
- Database: Cloud SQL PostgreSQL
- Private assets: GCS bucket for contractor logos, served back through authenticated backend proxy routes
- Container registry: GHCR

Cookie auth is configured for the shared parent domain `.stima.odysian.dev`.

Boundary hardening notes:
- Backend host validation is driven by `ALLOWED_HOSTS`.
- Backend trusts `X-Forwarded-*` headers only from `TRUSTED_PROXY_IPS`.
- Production startup requires `REDIS_URL`; local development can leave it unset and run with the documented in-memory degraded fallback.
- Shared production Redis (for example Upstash) is supported when Stima isolates every key under `REDIS_KEY_PREFIX` (default `stima`), keeping its `stima:*` keys separate from sibling apps such as Rostra's `rostra:*`.
- GCS logo storage is private-by-default: uniform bucket-level access enabled, public access prevention enabled, least-privilege runtime IAM only, and no object ACL reliance in app or runbook flows.
- Backend emits baseline security headers for backend-served responses; static-host CSP headers remain owned by the frontend host/CDN layer.
- The SPA shell is compatible with `script-src 'self'`; Google Fonts and Material Symbols still require explicit font/style allowlisting until they are self-hosted.
