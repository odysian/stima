# ADR-004: Persisted Extraction Draft Boundary

**Date:** 2026-04-29
**Status:** Accepted
**Spec/Task:** P0 Field-Resilient Capture / P1 Pilot-Ready Product context

---

## Context

Stima's core product promise is to turn rough field input into a usable quote draft quickly. The early shape of AI extraction could be treated as a temporary `ExtractionResult`: the backend extracts structured line items and returns them to the frontend, then the frontend/user flow decides whether to persist a quote later.

That shape is simple, but it creates product and reliability problems:

- extracted work can be lost if the browser refreshes, auth expires, mobile signal drops, or the user navigates away before saving;
- the frontend has to carry a temporary AI payload through multiple screens;
- the difference between "AI output exists" and "a real quote exists" becomes ambiguous;
- retry/idempotency behavior is harder because a successful extraction is not necessarily tied to a durable quote;
- mobile recovery flows need a stable server-side destination after extraction succeeds.

The current repo has moved unified extraction to a stronger boundary:

- `POST /api/quotes/extract` accepts notes, audio clips, optional customer id, and optional idempotency key.
- If ARQ is unavailable, the sync fallback extracts and then calls `QuoteService.create_extracted_draft(...)` before returning `PersistedExtractionResponse` with `quote_id`.
- If ARQ is available, the API creates a durable extraction job row, enqueues `jobs.extraction`, and returns `202 JobRecordResponse`.
- The worker later extracts, creates the draft quote, stores the quote id on `job_records.document_id`, and exposes that id as `quote_id` once the job succeeds.
- `/api/quotes/convert-notes` remains an extraction-only endpoint and does not create a draft.
- `/api/quotes/{id}/append-extraction` has been removed; current tests expect it to return `404`.

The business consequence is that successful unified capture means "there is now a saved draft quote," not merely "there is temporary AI output."

## Options Considered

### Option A: Extraction-only response; frontend persists later

Return structured extraction data to the frontend and require the frontend to call `POST /api/quotes` after review.

**Pros:**

- simpler backend endpoint;
- easier to reason about extraction as a pure transformation;
- avoids creating database rows for drafts the user might abandon.

**Cons:**

- easy to lose work between extraction and save;
- local recovery has to preserve a larger temporary payload;
- retry/idempotency cannot naturally point to a persisted quote;
- the frontend carries too much responsibility for an important persistence boundary;
- worse fit for mobile field usage where interruption is common.

### Option B: Persist only after explicit user review/save

Run extraction, show a review screen, then persist only after the user taps Save or Continue.

**Pros:**

- avoids storing drafts until the user confirms they are useful;
- keeps draft list cleaner;
- still preserves the human review boundary before customer delivery.

**Cons:**

- still loses work if interruption occurs before save;
- user may think "draft generated" means "saved" when it does not;
- complicates offline/outbox retry because a successful extraction has no durable backend object;
- increases frontend state complexity.

### Option C: Unified extraction persists a server draft before reporting success (chosen)

Treat successful unified extraction as a persistence boundary. The backend persists a draft quote and returns a stable `quote_id`; async jobs report success only after draft persistence succeeds.

**Pros:**

- successful extraction always produces a recoverable quote draft;
- frontend navigation can target `quote_id` instead of carrying temporary AI state;
- local outbox sync can mark a session as synced only when a server quote exists;
- backend owns validation, pricing application, extraction metadata, and document numbering;
- idempotency replay can return the same `quote_id` and avoid duplicate drafts for the same submitted capture.

**Cons:**

- creates draft rows for some captures the user may later discard;
- requires cleanup/archive/delete UX for abandoned drafts;
- the extraction endpoint has more responsibilities: provider work, persistence, events, idempotency, and job enqueue behavior;
- persistence failure after extraction is now a first-class failure path that must be handled and logged.

## Decision

Choose **Option C: unified extraction persists a draft before reporting success**.

`POST /api/quotes/extract` is the canonical capture-to-draft boundary. It must not report success unless the extracted draft is persisted or an async job has been durably queued to perform that persistence.

Current behavior:

- Sync fallback path:
  - run extraction;
  - create the extracted draft quote;
  - emit quote/draft events;
  - return `200 PersistedExtractionResponse` with `quote_id`.
- Async path:
  - prepare capture input;
  - create `job_records` row with `job_type = extraction`;
  - enqueue `jobs.extraction`;
  - return `202 JobRecordResponse` with `quote_id = null` while pending/running;
  - worker creates the extracted draft;
  - worker stores the resulting quote id in `job_records.document_id`;
  - job status returns `quote_id` once successful.
- `convert-notes` stays extraction-only for explicit non-persisted extraction use.
- Append extraction is not part of the current contract.

The draft remains a draft. It is not customer-facing until the user explicitly reviews and chooses a delivery/share action.

## Consequences

**Product/user experience:**

- "Generated draft" means there is a saved quote users can return to.
- Mobile interruptions are less destructive because the backend owns the completed draft.
- Unassigned extracted drafts are allowed so users can capture before choosing a customer.
- The app needs good draft cleanup/archive/delete affordances because more drafts can exist.

**Backend/API:**

- `PersistedExtractionResponse` must continue to include `quote_id`.
- `JobRecordResponse.quote_id` is the canonical async navigation signal once extraction succeeds.
- `job_records.document_id` is meaningful for successful extraction jobs.
- Extraction job success means both provider extraction and draft persistence succeeded.
- Persistence failure after extraction should be terminal/non-retryable unless the cause is explicitly classified otherwise.

**Frontend:**

- Capture/outbox code should navigate or mark sync success from `quote_id`, not temporary extraction payload alone.
- The review screen should load the persisted quote detail.
- Local outbox retry should use idempotency keys to avoid duplicate drafts when retrying a capture.

**Security/LLM safety:**

- AI output is schema-validated and persisted only as a draft.
- AI cannot bypass human review or customer-facing delivery actions.
- Extraction metadata can surface review hints, but delivery remains explicit user action.

**Revisit triggers:**

- If pilot users abandon many accidental drafts, add stronger archive/cleanup UX before changing the persistence boundary.
- If quote drafts become expensive to store or process, add retention/archive policy rather than returning to temporary-only extraction.
- If future "append extraction" returns, document a separate ADR because appending to existing customer-visible documents has different safety and edit-history implications.

## Evidence Reviewed

- `backend/app/features/quotes/api.py`
- `backend/app/features/quotes/creation/service.py`
- `backend/app/features/jobs/schemas.py`
- `backend/app/worker/job_registry.py`
- `frontend/src/features/quotes/services/quoteService.ts`
- `frontend/src/features/quotes/offline/outboxEngine.ts`
- `backend/app/features/quotes/tests/test_quote_extraction.py`
- `docs/ARCHITECTURE.md`
