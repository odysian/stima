# Plan: Milestone 6 — Operational Visibility

**Date:** 2026-03-27
**Roadmap ref:** `docs/V1_ROADMAP.md` — Milestone 6
**Mode:** single (one task, one PR)

---

## Goal

Ship error monitoring and a basic admin analytics route before the first public endpoint (M2) goes live, so unhandled exceptions are captured and pilot event data is queryable.

---

## Non-Goals

- Contractor-facing admin UI or dashboard (internal tooling only)
- User-facing analytics or reporting
- `is_admin` role or admin user accounts (see Admin Access Model in roadmap)
- Push notifications or alerting (V2)
- Custom Sentry dashboards or alert rules (manual setup post-deploy)
- Performance monitoring / APM (Sentry free tier captures basics; no custom instrumentation)

---

## Current State Audit

### Error handling (backend)
`backend/app/main.py` — FastAPI app with standard exception handlers. No Sentry SDK installed. Unhandled exceptions return 500 with default FastAPI error response. No structured error capture beyond stdout logs.

### Error handling (frontend)
`frontend/src/` — No global error boundary. React errors crash the component tree. No Sentry SDK installed. Network errors caught per-component in try/catch blocks but not reported externally.

### Event logger
`backend/app/shared/event_logger.py:21-30` — Pilot events persisted to `event_logs` table. After M1+M2, the whitelist will include: `quote_started`, `audio_uploaded`, `draft_generated`, `draft_generation_failed`, `quote_pdf_generated`, `quote_shared`, `quote_approved`, `quote_marked_lost`, `quote_viewed`.

### Event logs table
`backend/app/features/auth/models.py` (or wherever EventLog model lives) — `event_logs` table with `user_id`, `event_name`, `metadata_json`, `created_at`. No aggregation queries exist today.

### Admin routes
None exist. No admin router or access control mechanism.

---

## Schema Changes

None. The `event_logs` table is already sufficient for the analytics query.

---

## Backend Changes

### 1. Sentry SDK integration

**Install:** `sentry-sdk[fastapi]` (Python Sentry SDK with FastAPI integration)

**Setup in `main.py` or `core/sentry.py`:**

```python
import sentry_sdk

if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=0.0,       # no APM in V1
        send_default_pii=False,       # never send PII
    )
```

**Config additions (`config.py`):**
- `SENTRY_DSN: str | None = None` — optional, Sentry disabled when not set
- `ENVIRONMENT` already exists

**Behavior:**
- When `SENTRY_DSN` is set, unhandled exceptions in FastAPI request handlers are automatically captured by the Sentry FastAPI integration
- No PII: `send_default_pii=False` ensures request bodies, cookies, and user data are not sent
- No performance tracing in V1 (`traces_sample_rate=0.0`)
- Local dev: `SENTRY_DSN` left unset, Sentry is a no-op

### 2. Event logger: add remaining V1 events

After all milestones ship, `_PILOT_EVENT_NAMES` should include:

```python
_PILOT_EVENT_NAMES = frozenset({
    # V0
    "quote_started",
    "audio_uploaded",
    "draft_generated",
    "draft_generation_failed",
    "quote_pdf_generated",
    "quote_shared",
    # M1
    "quote_approved",
    "quote_marked_lost",
    # M2
    "quote_viewed",
    # M3
    "email_sent",
    # M5
    "invoice_created",
    "invoice_viewed",
})
```

M6 itself adds `email_sent`, `invoice_created`, and `invoice_viewed` to the whitelist so they are ready when M3 and M5 ship. Each milestone is responsible for actually calling `log_event()` at the right point — M6 just ensures the whitelist is complete.

**Decision for human review:** Should M6 pre-register all future event names, or should each milestone add its own events as it ships? Pre-registering is simpler (one whitelist update) and prevents the "forgot to add to whitelist" bug that M1 explicitly called out. **Recommendation:** Pre-register all known V1 events in M6.

### 3. Admin analytics route: `GET /api/admin/events`

**Access control:**

Per the roadmap's Admin Access Model, this is internal operator tooling, not a contractor-facing route. Access mechanism:

- Environment-gated: route only registers when `ADMIN_API_KEY` env var is set
- Auth: request must include `X-Admin-Key` header matching `ADMIN_API_KEY`
- No contractor session or CSRF required
- Route is not listed in OpenAPI docs (`include_in_schema=False`)

**Config addition:**
- `ADMIN_API_KEY: str | None = None`

**Query parameters:**
- `event_name: str | None` — filter by specific event (optional)
- `start_date: date` — inclusive (required)
- `end_date: date` — inclusive (required)

**Response:**

```json
{
  "events": [
    {
      "event_name": "quote_shared",
      "date": "2026-03-27",
      "count": 12
    },
    {
      "event_name": "quote_viewed",
      "date": "2026-03-27",
      "count": 8
    }
  ],
  "total": 20
}
```

**Query:** Simple `GROUP BY event_name, DATE(created_at)` with optional event_name filter and date range WHERE clause. No joins needed.

### 4. Structured error logging on extraction pipeline

`backend/app/features/quotes/extraction_service.py` — review existing error handling. The extraction pipeline already logs `draft_generation_failed` events. M6 should ensure:

- All `except` blocks in the extraction/transcription/audio pipeline call `sentry_sdk.capture_exception()` in addition to the existing event log
- No new code paths needed — just add Sentry capture at existing error boundaries

---

## Frontend Changes

### 1. Sentry SDK integration

**Install:** `@sentry/react`

**Setup in `main.tsx` (or a new `sentry.ts` init file):**

```typescript
import * as Sentry from "@sentry/react";

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_ENVIRONMENT ?? "development",
    tracesSampleRate: 0.0,
    sendDefaultPii: false,
  });
}
```

**Env var:** `VITE_SENTRY_DSN` — Vite env prefix for client-side access.

### 2. React Error Boundary

Wrap the app (or at minimum the router) in `Sentry.ErrorBoundary`:

```tsx
<Sentry.ErrorBoundary fallback={<ErrorFallback />}>
  <RouterProvider router={router} />
</Sentry.ErrorBoundary>
```

**`ErrorFallback` component:** Simple "Something went wrong" screen with a "Reload" button. Uses design system tokens. Minimal — not a full page layout.

### 3. Network error capture

The shared `request()` function in `http.ts` catches network errors. Add `Sentry.captureException()` at the catch boundary for non-401 errors (401s are expected auth flow, not error monitoring targets).

**Decision for human review:** Should all non-401 network errors go to Sentry, or only 5xx? 4xx errors (422 validation, 404 not found) are expected application behavior, not bugs. **Recommendation:** Capture only 5xx responses and network failures (fetch throws). 4xx errors are handled by the UI and don't need Sentry.

---

## Key Risks and Edge Cases

| Risk | Mitigation |
|---|---|
| Sentry SDK bloats frontend bundle | `@sentry/react` is ~30KB gzipped; acceptable for error monitoring. Tree-shaking keeps it minimal when DSN is not set |
| Admin route exposed accidentally | Environment-gated registration + API key auth + `include_in_schema=False`. Route literally doesn't exist without `ADMIN_API_KEY` |
| PII leaks to Sentry | `send_default_pii=False` on both SDKs. Review Sentry data scrubbing settings in dashboard post-setup |
| Noisy Sentry alerts from known issues | Don't configure alerting rules in V1. Use Sentry as a passive log. Alert rules are manual dashboard work |
| `event_logs` table grows unbounded | Not a V1 concern — pilot scale is small. Flag for V2 retention policy |
| Admin events query slow on large tables | Add index on `(event_name, created_at)` if needed. Pilot scale won't hit this |

---

## Implementation Order

1. Backend: add `SENTRY_DSN` and `ADMIN_API_KEY` to `config.py`
2. Backend: initialize Sentry SDK in app startup (gated on `SENTRY_DSN`)
3. Backend: add `sentry_sdk.capture_exception()` calls in extraction pipeline error handlers
4. Backend: pre-register all V1 event names in `_PILOT_EVENT_NAMES`
5. Backend: create admin router with API key dependency
6. Backend: implement `GET /api/admin/events` with date range + event name filters
7. Backend tests: admin route (auth, query filters, date range, missing key returns 401/403)
8. Frontend: install `@sentry/react`, initialize in `main.tsx`
9. Frontend: add `Sentry.ErrorBoundary` with `ErrorFallback` component
10. Frontend: add `Sentry.captureException()` in `http.ts` for 5xx and network errors
11. Frontend tests: ErrorFallback renders, Sentry init doesn't crash without DSN
12. Update `docs/ARCHITECTURE.md`: add admin endpoint, note Sentry integration

---

## Acceptance Criteria

- [ ] Backend Sentry captures unhandled exceptions when `SENTRY_DSN` is configured
- [ ] Frontend Sentry captures React errors and 5xx network errors when `VITE_SENTRY_DSN` is configured
- [ ] Neither SDK sends PII (request bodies, cookies, user data)
- [ ] App functions normally when Sentry DSN is not set (no crashes, no console errors)
- [ ] `GET /api/admin/events` returns aggregated event counts by name and day
- [ ] Admin route returns 401/403 without valid `X-Admin-Key` header
- [ ] Admin route does not exist when `ADMIN_API_KEY` is not set
- [ ] Admin route is not in OpenAPI docs
- [ ] All V1 event names are pre-registered in `_PILOT_EVENT_NAMES`
- [ ] Extraction pipeline errors are captured in Sentry
- [ ] React `ErrorFallback` renders on unhandled component errors
- [ ] `docs/ARCHITECTURE.md` updated with admin endpoint and Sentry note

---

## Verification

```bash
make backend-verify
make frontend-verify
```

Manual:
1. Set `SENTRY_DSN` in dev env → trigger an unhandled exception → verify it appears in Sentry dashboard
2. Set `VITE_SENTRY_DSN` → trigger a React error → verify ErrorFallback renders and Sentry captures
3. Call `GET /api/admin/events?start_date=2026-03-01&end_date=2026-03-31` with valid API key → verify response
4. Call same endpoint without API key → verify 401/403
5. Unset `ADMIN_API_KEY` → verify `/api/admin/events` returns 404
6. Verify no PII in Sentry event payloads (spot check)
