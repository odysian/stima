# Task: Slice 2 Pilot Event Logging

Parent Spec: #90

## Goal

Persist a minimal pilot analytics trail for the quote flow using a single
`event_logs` table and service-layer writes, without introducing a full analytics
framework or risking the main request path.

Parent references:
- `docs/V0_ROADMAP.md` § Slice 2 — Event logging
- `docs/Stima_V0_Vertical_Slice_Spec.md` § Optional Table: `event_logs`

---

## Problem Framing

### Goal

Capture enough product-validation data to answer pilot questions such as:
- Are users starting quotes successfully?
- Are audio uploads common?
- How often does draft generation fail?
- How often do users generate PDFs and share quotes?

### Non-goals

- No external analytics vendor
- No dashboards
- No background queue
- No retry worker
- No event batching

### Constraints

- Main quote flow must not fail if event persistence fails
- Keep the schema small and stable
- Reuse the current `log_event(...)` entrypoint if practical to avoid scattering
  event-writing logic

---

## Locked Design Decisions

### Keep the event schema minimal

Create a single table:
- `id`
- `user_id`
- `event_name`
- `metadata_json`
- `created_at`

No per-event tables, no denormalized reporting views in V0.

### Persist only the roadmap event set

Initial event names:
- `quote_started`
- `audio_uploaded`
- `draft_generated`
- `draft_generation_failed`
- `quote_pdf_generated`
- `quote_shared`

Do not widen scope into a full event taxonomy for every user action in the app.

Existing dot-notation operational logs such as `quote.created`, `quote.updated`,
`quote.pdf_generated`, `quote.shared`, and `customer.created` remain stdout-only and
are out of scope for DB persistence in this task.

### Service-layer writes, fire-and-forget semantics

Event writes should happen from service/orchestration boundaries, not route handlers.
If persistence fails:
- swallow the failure
- optionally keep stdout logging for visibility
- never fail the main user-facing operation because logging failed

### Evolve the existing event logger rather than bypassing it

The repo already uses `backend/app/shared/event_logger.py`. The preferred path is to
refactor that layer into a small event sink abstraction or helper that can emit both:
- structured stdout logs
- DB-backed `event_logs` rows

This avoids creating two unrelated logging entrypoints.

### Use explicit extraction/quote service call sites

Instrumentation belongs at these boundaries:
- `ExtractionService.extract_combined()`
  - after empty-input validation passes: `quote_started`
  - when clips are present: `audio_uploaded`
  - on success: `draft_generated` (replacing the current `extraction.completed`)
  - on handled audio/transcription/extraction failure: `draft_generation_failed`
- `QuoteService.generate_pdf()`
  - on success: `quote_pdf_generated`
- `QuoteService.share_quote()`
  - on success: `quote_shared`

Do not add route-layer instrumentation in `api.py`.

### Event persistence must use a separate async session

DB-backed event writes must use a separate session acquired from
`get_session_maker()`. Do not reuse the request-scoped session from the main
business transaction.

This keeps event-write rollback or commit failures from polluting the main request's
session state.

### Store entity references in `metadata_json`

Keep the table minimal:
- `id`
- `user_id`
- `event_name`
- `metadata_json`
- `created_at`

Store `quote_id`, `customer_id`, and any lightweight `detail` values inside
`metadata_json` as a JSON object. Do not add dedicated `quote_id` or `customer_id`
columns in V0.

### Keep the `log_event(...)` callsite contract stable

Do not make all existing service callsites async-aware. Keep the current
`log_event(event, *, user_id, quote_id, customer_id, detail)` calling shape.

Refactor the event logger internals so app startup configures:
- stdout event logging
- an optional module-level async session factory for DB persistence

When the session factory is configured, `log_event(...)` should best-effort schedule
DB persistence while always preserving the existing stdout log behavior.

---

## Risks And Edge Cases

- Logging must not block or contaminate the main request session state
- Failure events need enough metadata to be useful without storing sensitive payloads
- Existing stdout event logs and new DB-backed pilot events will coexist during V0

---

## Scope

### Backend

**Migration**
- Add `event_logs` table with the minimal schema above

**Model / registry**
- Add the SQLAlchemy model
- Register it in `backend/app/features/registry.py`

**Shared logging layer**
- Refactor `backend/app/shared/event_logger.py` so it can persist DB events while
  preserving current structured stdout logging where useful
- Keep failure handling explicit and non-blocking
- Configure the optional DB session factory at app startup next to
  `configure_event_logging()`

**Quote flow instrumentation**
- Log `quote_started`
  - in `ExtractionService.extract_combined()` after empty-input validation passes
- Log `audio_uploaded`
  - in `ExtractionService.extract_combined()` when at least one audio clip is submitted
- Log `draft_generated`
  - in `ExtractionService.extract_combined()` when extraction succeeds
  - replace the current `extraction.completed` event there
- Log `draft_generation_failed`
  - in `ExtractionService.extract_combined()` when handled extraction pipeline failures occur
- Log `quote_pdf_generated`
  - in `QuoteService.generate_pdf()` when PDF generation succeeds
- Log `quote_shared`
  - in `QuoteService.share_quote()` when share succeeds

### Tests

**Backend tests**
- Migration/model registration test coverage as needed
- Unit/integration tests that:
  - successful quote flow writes expected events
  - failed extraction writes failure event
  - logging persistence failure does not fail the main request

### Docs

**`docs/ARCHITECTURE.md`**
- Document the minimal event log schema and event list

---

## Acceptance Criteria

- [ ] New `event_logs` table exists with `id`, `user_id`, `event_name`, `metadata_json`, `created_at`
- [ ] Model is registered for Alembic / app metadata
- [ ] Quote flow persists the Slice 2 event set only
- [ ] Event writes happen from service/orchestration boundaries, not route handlers
- [ ] Pilot event persistence uses underscore event names only
- [ ] Existing dot-notation operational logs remain intact as stdout logs
- [ ] Extraction and quote service call sites match the locked placement above
- [ ] DB-backed event writes use a separate async session from the request transaction
- [ ] `metadata_json` stores lightweight values like `quote_id`, `customer_id`, and `detail`
- [ ] Existing `log_event(...)` callsites remain unchanged
- [ ] Logging persistence failures do not fail quote extraction / PDF / share flows
- [ ] Existing operational logging remains intact or is intentionally replaced with a documented migration path
- [ ] Tests cover success-path logging, failure-path logging, and non-blocking behavior on log write failure
- [ ] `make backend-verify` passes

## DoD Gate

After a pilot session, the team can inspect `event_logs` and understand the major
quote-flow outcomes without having instrumented a separate analytics platform.

---

## Verification

```bash
make backend-verify
```

Fallback:

```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest
```
