# ADR-006: Local-First Capture Recovery with IndexedDB and Foreground Outbox Retry

**Date:** 2026-04-29
**Status:** Accepted
**Spec/Task:** P0 Field-Resilient Capture

---

## Context

Stima is mobile-first and field-oriented. The user may be standing outside, walking between jobs, switching apps, losing signal, recording voice notes, or refreshing the browser. The product cannot assume a stable desktop-style session.

The capture workflow is also the highest-loss-risk part of the app. If notes/audio are lost before extraction, the user may not be able to reconstruct the job details later.

The current repo implements a local-first capture recovery layer:

- IndexedDB database: `stima-local`.
- Stores:
  - `capture_sessions`
  - `sync_events`
  - `audio_clips`
  - `local_drafts`
  - `outbox_jobs`
- Capture sessions store notes, customer snapshot, clip ids, idempotency key, server quote id, extract job id, status, failure kind, and timestamps.
- Audio clips are persisted as `ArrayBuffer`/Blob data in IndexedDB, associated with session id and user id.
- Recoverable statuses include `local_only`, `ready_to_extract`, `submitting`, and `extract_failed`.
- Outbox jobs retry foreground sync when online or after auth recovery.
- Outbox jobs use idempotency keys so retrying a submitted capture should not create duplicate server drafts.
- The system is device-local. It is not a multi-device sync system.
- The system is not offline AI. Extraction still requires backend/provider availability.

## Options Considered

### Option A: Keep capture state only in React component state

Store notes/audio in memory until submit completes.

**Pros:**

- simplest implementation;
- no local persistence complexity;
- no stale local data cleanup needed.

**Cons:**

- refresh/navigation/app kill loses capture;
- bad fit for mobile field use;
- no recovery after auth expiry or offline transition;
- audio clips are especially easy to lose.

### Option B: Use `localStorage` / `sessionStorage`

Persist notes and lightweight state in browser storage.

**Pros:**

- easy to implement;
- survives refresh;
- sufficient for small text-only drafts.

**Cons:**

- not appropriate for audio blobs;
- synchronous API can block;
- limited storage and no robust indexing;
- poor fit for structured recovery/outbox records;
- more fragile for long-lived local capture state.

### Option C: Use IndexedDB for local capture state and audio, but no outbox

Persist local sessions and clips, but require the user to manually resubmit.

**Pros:**

- preserves data across refresh/offline interruptions;
- lower complexity than an automatic retry engine.

**Cons:**

- user must understand failed/submitted states;
- retry behavior can create duplicate server drafts without idempotency;
- no foreground auto-retry when network/auth recovers;
- weaker "capture now, clean up later" experience.

### Option D: IndexedDB capture storage plus foreground outbox retry (chosen)

Use IndexedDB for capture sessions/audio and an outbox job store to retry extraction submissions safely.

**Pros:**

- notes and audio survive refresh/reopen;
- outbox can retry after offline, timeout, server retryable, or auth-required states;
- idempotency keys tie retries to one backend extraction resource;
- frontend can mark local sessions synced only after receiving a persisted `quote_id`;
- recoverable sessions can be listed and resumed;
- cleanup policies can manage stale local data.

**Cons:**

- more frontend infrastructure;
- requires robust IndexedDB parsing/migration/error handling;
- local state can still be lost if browser storage is cleared;
- not cross-device;
- foreground retry depends on the app being open/running.

## Decision

Choose **Option D: IndexedDB capture storage plus foreground outbox retry**.

Local capture is a first-class product capability. The app should preserve capture state on the device until it either syncs successfully to a server quote or is explicitly/automatically cleaned up by policy.

Current behavior expectations:

- Create a `capture_session` as soon as a local capture starts.
- Persist notes updates and audio clip blobs to IndexedDB.
- Use `outbox_jobs` for extraction submissions that need retry.
- Use a per-job idempotency key for `/api/quotes/extract`.
- Treat sync as successful only when:
  - sync fallback returns `quoteId`, or
  - async job polling returns `quote_id`.
- Mark capture as `synced` once a server quote id exists.
- Mark terminal failures as `extract_failed` with failure kind/error for user recovery.
- Pause retry for auth-required failures until auth is restored.
- Keep recovery device-local and explicitly avoid implying multi-device sync.

## Consequences

**Product/user experience:**

- Users can capture in the field before perfect connectivity.
- Refreshes and app restarts are less destructive.
- Pending/failed captures can be resumed instead of silently disappearing.
- A synced capture points to a real persisted quote draft.

**Frontend architecture:**

- IndexedDB becomes a durable client-side dependency for capture.
- Capture code must handle storage-unavailable/reset cases gracefully.
- Outbox code must classify failures into retryable, auth-required, validation, or terminal categories.
- Local IDs and idempotency keys matter; do not regenerate them casually.
- Recovery UI should clearly distinguish local-only, queued/submitting, failed, and synced states.

**Backend/API coupling:**

- `/api/quotes/extract` must preserve idempotency behavior.
- `QuoteExtractResponse` must preserve sync/async shapes.
- `JobRecordResponse.quote_id` is required for async outbox completion.
- Backend extraction must not report success without a persisted quote id.

**Data retention/privacy:**

- Local browser storage may contain typed notes and audio blobs.
- Synced audio clips should be cleaned up after retention.
- Stale recoverable captures should be cleaned after policy windows.
- Support/telemetry must not automatically exfiltrate local notes/audio/transcripts.

**Limitations:**

- This is not cross-device sync.
- This is not offline AI extraction.
- If the browser clears IndexedDB, local captures can be lost.
- Foreground retry requires the app to run; it is not guaranteed background sync.

**Revisit triggers:**

- If users expect handoff between phone and desktop, design a separate server-backed draft-sync model.
- If local storage reset is common, improve user messaging and backup strategy.
- If retry behavior creates duplicates, tighten idempotency tests before changing the outbox.
- If background sync becomes reliable enough for target browsers, consider it as an enhancement, not as the core dependency.

## Evidence Reviewed

- `frontend/src/features/quotes/offline/captureDb.ts`
- `frontend/src/features/quotes/offline/captureSessionRepository.ts`
- `frontend/src/features/quotes/offline/audioRepository.ts`
- `frontend/src/features/quotes/offline/outboxRepository.ts`
- `frontend/src/features/quotes/offline/outboxEngine.ts`
- `frontend/src/features/quotes/offline/useLocalCaptureSession.ts`
- `frontend/src/features/quotes/offline/useRecoverableCaptures.ts`
- `frontend/src/features/quotes/services/quoteService.ts`
- `backend/app/features/quotes/api.py`
- `backend/app/features/quotes/tests/test_quote_extraction.py`
- `docs/qa/P0_FIELD_RESILIENT_CAPTURE_QA.md`
- `docs/roadmaps/P0_FIELD_RESILIENT_CAPTURE.md`
