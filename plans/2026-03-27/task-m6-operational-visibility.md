## Goal

Ship error monitoring and a basic admin analytics route before M2 goes live.
Unhandled exceptions must be captured in Sentry; pilot event data must be queryable
via a key-gated internal endpoint.

## Non-Goals

- Contractor-facing admin UI or dashboard
- User-facing analytics or reporting
- `is_admin` role or admin user accounts
- Push notifications or alerting
- Custom Sentry alert rules or dashboards (manual setup post-deploy)
- APM / performance monitoring (`traces_sample_rate=0.0`)

## Constraints

- `SENTRY_DSN` unset → Sentry is a no-op; no crashes, no console errors
- `ADMIN_API_KEY` unset → admin route does not register (returns 404)
- `send_default_pii=False` on both SDKs; no request bodies, cookies, or user data sent
- Frontend captures 5xx responses and network failures only; 4xx are expected behavior
- Admin route not in OpenAPI schema (`include_in_schema=False`)
- Admin route returns 401 for both absent and invalid `X-Admin-Key`

## Decision Locks

- **Event whitelist**: Pre-register all known V1 event names in M6. Each future milestone
  calls `log_event()` without touching the whitelist. Alternative (per-milestone adds) was
  rejected because forgetting to update creates silent data gaps in `event_logs`.
- **Admin router placement**: `backend/app/admin/` — top-level module, not inside `features/`.
  Everything in `features/` is contractor-facing behind standard cookie auth; `admin/` makes
  the API-key access pattern visible in the file tree.
- **Sentry init placement**: `backend/app/core/sentry.py` + `frontend/src/sentry.ts`.
  Entry points (`main.py`, `main.tsx`) stay thin; Sentry config lives in its own file
  so future additions (before_send, custom tags, release tracking) don't bloat the entrypoint.

## Implementation Steps

1. **Config** — add `SENTRY_DSN: str | None = None` and `ADMIN_API_KEY: str | None = None`
   to `backend/app/core/config.py`

2. **Backend Sentry init** — create `backend/app/core/sentry.py`; call from `main.py` startup
   gated on `settings.SENTRY_DSN`

3. **Extraction pipeline capture** — add `sentry_sdk.capture_exception()` at existing `except`
   blocks in `backend/app/features/quotes/extraction_service.py` (no new error boundaries)

4. **Event whitelist** — pre-register all V1 events in `_PILOT_EVENT_NAMES`
   in `backend/app/shared/event_logger.py`:
   `quote_started`, `audio_uploaded`, `draft_generated`, `draft_generation_failed`,
   `quote_pdf_generated`, `quote_shared`, `quote_approved`, `quote_marked_lost`,
   `quote_viewed`, `email_sent`, `invoice_created`, `invoice_viewed`

5. **Admin router** — create `backend/app/admin/router.py` with:
   - `APIKeyHeader` dependency returning 401 on absent or invalid key
   - `GET /api/admin/events` with query params: `event_name?`, `start_date`, `end_date`
   - `GROUP BY event_name, DATE(created_at)` query with WHERE on date range and optional name
   - Response: `{ "events": [{ "event_name", "date", "count" }], "total" }`
   - `include_in_schema=False`
   - Register in `main.py` conditionally when `settings.ADMIN_API_KEY` is set

6. **Backend tests** — cover: valid key + results, absent key → 401, bad key → 401,
   date range filter, `event_name` filter, no matching events → empty list

7. **Frontend Sentry init** — create `frontend/src/sentry.ts`; import and call in `main.tsx`
   gated on `import.meta.env.VITE_SENTRY_DSN`

8. **ErrorBoundary** — wrap `<RouterProvider>` in `<Sentry.ErrorBoundary fallback={<ErrorFallback />}>`;
   `ErrorFallback` is a minimal "Something went wrong" screen with a Reload button,
   using design system tokens

9. **Network error capture** — in `frontend/src/shared/lib/http.ts`, add
   `Sentry.captureException()` for 5xx responses and fetch throws; skip 4xx

10. **Frontend tests** — `ErrorFallback` renders on thrown error;
    Sentry init with no DSN does not throw

11. **Docs** — update `docs/ARCHITECTURE.md`: note `backend/app/admin/` module,
    admin endpoint contract, and Sentry integration

## New Dependencies (Pre-approved)

- Backend: `sentry-sdk[fastapi]`
- Frontend: `@sentry/react`

## Risks and Edge Cases

| Risk | Mitigation |
|---|---|
| Admin route exposed accidentally | Env-gated registration + API key + not in OpenAPI schema |
| PII leaks to Sentry | `send_default_pii=False` on both SDKs |
| 4xx noise in Sentry | Capture only 5xx + fetch throws; 4xx handled by UI |
| `event_logs` grows unbounded | Pilot scale; V2 retention policy |
| Future milestones forget to call `log_event()` | Whitelist pre-registered; each milestone just calls the function |

## Acceptance Criteria

- [ ] Backend Sentry captures unhandled exceptions when `SENTRY_DSN` is set
- [ ] Frontend Sentry captures React errors and 5xx/network failures when `VITE_SENTRY_DSN` is set
- [ ] Neither SDK sends PII
- [ ] App functions normally when Sentry DSN is unset (no crashes, no console errors)
- [ ] `GET /api/admin/events` returns aggregated counts by event name and day
- [ ] Admin route returns 401 for absent or invalid `X-Admin-Key`
- [ ] Admin route returns 404 when `ADMIN_API_KEY` is unset (route not registered)
- [ ] Admin route absent from OpenAPI docs
- [ ] `_PILOT_EVENT_NAMES` contains all 12 V1 event names
- [ ] Extraction pipeline `except` blocks call `sentry_sdk.capture_exception()`
- [ ] `ErrorFallback` renders on unhandled React error
- [ ] `docs/ARCHITECTURE.md` updated

## Verification

```bash
make backend-verify
make frontend-verify
```

Manual (human operator):
1. Set `SENTRY_DSN` → trigger unhandled exception → confirm event appears in Sentry dashboard
2. Set `VITE_SENTRY_DSN` → trigger React error → confirm ErrorFallback renders and event captured
3. `GET /api/admin/events?start_date=2026-03-01&end_date=2026-03-31` with valid key → valid response
4. Same request without key → 401
5. Unset `ADMIN_API_KEY` → same route → 404
6. Spot-check Sentry event payload for PII
