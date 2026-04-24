# Stima P0 Roadmap & Spec Index

## Product direction

**Positioning promise:** Stima should become the fastest, calmest way for a solo tradesperson to turn messy field notes into a clean, sendable quote from their phone, without adopting a full field-service platform.

**Near-term wedge:** field-resilient quote capture. The app should feel dependable even when signal is bad, the browser refreshes, or AI extraction has to wait.

**Roadmap rule:** prioritize features that improve speed, trust, recovery, and quote completion. Defer features that make Stima feel like a small Jobber/ServiceM8 clone.

---

## Product priority vs. implementation order

These P0 items are ranked by **product value**, not by the exact order they should be implemented.

The highest-value product outcome is the **Offline Capture Workspace**, but the safest implementation path starts with a small performance/instrumentation baseline and an IndexedDB foundation. This avoids building offline behavior blind and gives later specs a shared local-storage layer.

---

## P0 product priority

| Product rank | Spec | Outcome | Why P0 |
|---:|---|---|---|
| 1 | Offline Capture Workspace | User can capture notes locally and recover them after refresh, tab close, bad signal, or app reopen. | This is the product wedge: capture now, clean up later. |
| 2 | Audio Blob Lifecycle Hardening | Voice clips become durable, memory-safe, and upload-safe. | Audio is the riskiest offline asset. Losing clips destroys trust. |
| 3 | Local Draft Persistence Migration | Replace sessionStorage-based draft persistence with durable IndexedDB-backed storage. | Current session-scoped persistence is not enough for field reliability. |
| 4 | Idempotent Extraction Submit | Retried extract requests produce one server quote/draft, not duplicates. | Required before automatic retry/outbox behavior is safe. |
| 5 | Outbox Sync Engine | Queue extract/upload work while offline and safely submit when online. | Offline capture without safe sync creates duplicate/lost/stuck quotes. |
| 6 | Performance Baseline & Instrumentation | Measure route load, tap-to-record, local save, draft restore, extraction timing. | Speed is part of the product positioning, not just polish. |
| 7 | PWA Shell Foundations | Add installable app shell, manifest, service worker, and offline-open fallback. | Makes the browser app feel more reliable and app-like without going native. |

---

## Recommended implementation order

0. **Performance Baseline & Instrumentation — minimal slice**  
   Add basic timing marks before offline work lands.

**Backend parallel track (runs alongside steps 1–2, no frontend dependency):**  
**Backend Infra Spec A — Redis Degraded Mode** — Wire intentional production degraded mode: `ALLOW_REDIS_DEGRADED_MODE` config flag, startup Redis probe, memory-backed limiter/idempotency/extraction stores, Redis client lifecycle on shutdown, enriched `/health` payload, startup observability log. Full spec: `plans/2026-04-24/p0-infra-spec-a-redis-degraded-mode.md`.

1. **IndexedDB Repository Foundation**  
   Add the local database, schema, repository layer, user scoping, and cleanup primitives.

2. **Offline Capture Workspace — notes-first path**  
   Persist local capture sessions and text notes, then restore/delete them from the UI.

3. **Audio Blob Lifecycle Hardening**  
   Add durable audio clip storage, object URL lifecycle management, and storage pressure handling.

4. **Local Draft Persistence Migration**  
   Move post-extraction quote/review draft state from sessionStorage to IndexedDB.

5. **Idempotent Extraction Submit**  
   Make backend extraction safe to retry before automatic outbox processing exists.

6. **Outbox Sync Engine**  
   Add foreground retry and queued submission once idempotency is in place.

7. **PWA Shell Foundations**  
   Add installability and cold offline app-shell support.

8. **Recovery UX polish + mobile QA pass**  
   Tighten copy, mobile behavior, edge cases, and real-device confidence.

---

## Backend Infra Spec A — Redis Degraded Mode

**Full spec:** `plans/2026-04-24/p0-infra-spec-a-redis-degraded-mode.md`  
**Track:** Parallel to implementation steps 1–2. Backend-only.

### Goal
Wire intentional production degraded mode so a Redis outage degrades the app rather than taking it down.

### Why P0
A Redis outage already caused a production incident (Upstash quota exhaustion). Without this, the app bricks when Redis is unreachable — directly undermining the field-resilience story of the offline capture P0.

### Scope
- `ALLOW_REDIS_DEGRADED_MODE` config escape hatch (default `false`)
- Startup Redis probe separating "configured" from "healthy"
- Memory-backed fallbacks for limiter, extraction controls, and idempotency store
- Redis-backed stores initialized in app lifespan with `aclose()` on shutdown
- `app.state.redis_runtime_mode` and `redis_degraded_reason` markers
- Enriched `/health` payload in degraded mode (HTTP 200, `runtime_mode`, `queue_available`)
- Single startup warning log per degraded activation

### Durability caveat

Memory-backed degraded-mode stores (limiter, idempotency, extraction controls) are process-local and best-effort. They are acceptable as an explicit degraded runtime — not as equivalent production durability. If the backend restarts or runs as multiple processes, memory fallback will not replicate state across instances. This is a known and accepted trade-off for degraded mode; it must not be used as a substitute for a healthy Redis deployment.

### Acceptance criteria
- Production boots with `ALLOW_REDIS_DEGRADED_MODE=true` and no usable Redis; `/health` returns 200
- Auth, CRUD, and inline extraction work in degraded mode
- Queue-only routes (PDF, email) return controlled `503`
- Redis clients close cleanly on app shutdown
- Startup emits one explicit warning with degraded reason
- Production fails fast when Redis is absent and `ALLOW_REDIS_DEGRADED_MODE=false`

---

## Spec 0 — Performance Baseline & Instrumentation

### Goal
Make Stima’s speed measurable before large offline/PWA changes land.

### Scope
- Add `performance.mark()` / `performance.measure()` around key capture/review flows.
- Track route load, tap-to-record, local save, draft restore, extract submit, and first editable draft.
- Add simple dev/debug logging first; later wire analytics.
- Add a bundle inspection and route-splitting audit.

### Target metrics
- Tap-to-record visible state: under 150ms warm.
- Local note save: under 50ms p95.
- Local clip save after stop: under 200ms p95.
- Reopen local capture/draft: under 400ms p95.
- Capture route interactive: under 2s p75 on mid-range mobile.

### Acceptance criteria
- Developer can inspect timing events locally.
- Regressions are visible during PR review.
- Offline work is not merged blindly without before/after timings.

---

## Spec 1 — IndexedDB Repository Foundation

### Goal
Create the shared durable local-storage layer used by offline capture, audio clips, local drafts, and later outbox work.

### Scope
- Add a small IndexedDB wrapper/repository module.
- Define versioned stores for `capture_sessions`, `audio_clips`, `local_drafts`, `outbox_jobs`, and `sync_events`, even if some are initially unused.
- Add user scoping to local records.
- Add cleanup/delete primitives.
- Add storage-estimate helper for warning UI.

### Non-goals
- Full offline capture UI.
- Automatic sync.
- Service worker caching.
- Storing auth tokens/secrets in IndexedDB.

### Acceptance criteria
- Repositories can create/read/update/delete local records in tests.
- Records are scoped by authenticated user id.
- Logout/account-switch behavior is defined before UI depends on the store.
- Corrupt or unknown-version data fails safely.

---

## Spec 2 — Offline Capture Workspace

### Goal
Create a local-first capture workspace where users can type notes and recover the capture before anything has successfully reached the backend.

### Scope
- New local capture session model.
- IndexedDB-backed text notes.
- Pending capture recovery UI.
- Manual submit to the existing extraction flow when online.
- Manual delete/discard of local sessions.
- Status states: `local_only`, `ready_to_extract`, `submitting`, `extract_failed`, `synced`, `discarded`.

### Non-goals
- Offline AI extraction.
- Durable audio blob storage. See **Spec 3 — Audio Blob Lifecycle Hardening**.
- Full PWA cold offline launch.
- Background sync automation.
- Automatic outbox retry.
- Server-side quote dedupe beyond passing future identifiers.

### Acceptance criteria
- User can type notes while offline.
- Refreshing or closing the browser does not lose the capture session once it contains user-entered work.
- Returning to the app shows a recoverable pending capture.
- User can delete a local session.
- User clearly sees whether work is local, ready to extract, submitting, failed, synced, or discarded.
- Existing online extraction still works from the user’s perspective.

### Suggested files/surfaces
- `frontend/src/features/quotes/components/CaptureScreen.tsx`
- new `frontend/src/features/quotes/offline/` module
- new IndexedDB repository layer from Spec 1

---

## Spec 3 — Audio Blob Lifecycle Hardening

### Goal
Make voice clips durable, memory-safe, and upload-safe.

### Scope
- Store audio blobs in IndexedDB, not long-lived React state.
- Keep React state to clip metadata only.
- Generate object URLs lazily for playback.
- Revoke object URLs after playback/removal/unmount.
- Track clip size, duration, MIME type, and sequence.
- Enforce V1 storage limits.

### Non-goals
- Client-side transcription.
- Audio compression/transcoding in browser.
- Native app recording APIs.
- Automatic outbox retry.

### Acceptance criteria
- Clips survive app restart.
- Removing a clip frees local storage.
- Large clips do not cause obvious UI jank.
- Upload reads blobs from IndexedDB just-in-time.
- User sees a clear warning if storage is low or clip save fails.
- Object URLs are not persisted and are cleaned up correctly.

---

## Spec 4 — Local Draft Persistence Migration

### Goal
Move quote/review/edit draft persistence away from `sessionStorage` and into a durable local storage layer that can support offline recovery.

### Scope
- Replace `useQuoteDraft.ts` session persistence.
- Replace or wrap `persistedDocumentDraft.ts` session persistence.
- Store draft snapshots in IndexedDB.
- Track dirty/local/server states explicitly.

### Non-goals
- Multi-device conflict resolution.
- Full offline editing of all authenticated server documents.
- Service worker caching.

### Acceptance criteria
- Existing review/edit flows still work online.
- Draft survives refresh, close, and reopen.
- Drafts are scoped by user/session/document id to avoid cross-user leakage on shared devices.
- Corrupt local drafts fail safely with a recovery/delete option.

### Suggested implementation shape

```ts
saveLocalDraft(input): Promise<void>
getLocalDraft(id): Promise<LocalDraft | null>
listRecoverableDrafts(): Promise<LocalDraftSummary[]>
deleteLocalDraft(id): Promise<void>
```

---

## Spec 5 — Idempotent Extraction Submit

### Goal
Make extraction safe to retry before any automatic outbox processing is allowed.

### Scope
- Add `Idempotency-Key` or `X-Client-Submission-Id` support to `/api/quotes/extract`.
- Store request fingerprint/status server-side.
- Return the existing result/job when the same key is retried.
- Add frontend support in `quoteService.extract`.

### Non-goals
- General idempotency for every endpoint.
- Long-term storage of all request bodies.
- Full outbox sync.

### Acceptance criteria
- Double-clicking extract cannot create duplicate quotes.
- Retrying after network failure cannot create duplicate quotes.
- Async extraction retries resolve to the same job or same quote.
- Backend tests cover duplicate key behavior.
- Outbox automation is blocked until this spec is complete.

---

## Spec 6 — Outbox Sync Engine

### Goal
Queue offline or failed work and retry it safely when connectivity returns.

### Scope
- Use the `outbox_jobs` IndexedDB store.
- Foreground retry loop triggered by app open, online event, and manual retry.
- Job states: `queued`, `running`, `succeeded`, `failed_retryable`, `failed_terminal`.
- Exponential backoff with max attempts.
- Sync event logging for debugging.
- Auth-required and validation-failed terminal handling.

### Non-goals
- Reliance on Background Sync as the only mechanism.
- Syncing every possible app action.
- Complex conflict resolution.
- Running before idempotent extraction exists.

### Acceptance criteria
- Offline extract requests are queued instead of failing destructively.
- Returning online attempts sync automatically.
- Manual retry is available.
- Failed jobs remain inspectable and recoverable.
- One queued capture maps to one eventual server draft.
- Auth expiration keeps local work and prompts re-auth instead of deleting data.

---

## Spec 7 — PWA Shell Foundations

### Goal
Make Stima installable and able to open to a useful recovery shell without network.

### Scope
- Add `manifest.webmanifest`.
- Add icons and app metadata.
- Register service worker.
- Precache app shell/static assets.
- Offline fallback route for local drafts/capture recovery.

### Non-goals
- Caching authenticated API responses.
- Full offline quote PDF/email/share behavior.
- Depending on Background Sync as required behavior.

### Acceptance criteria
- App is installable on Android Chrome and iOS Safari.
- App shell opens offline.
- User can reach local pending captures offline after the app shell is cached.
- Service worker update flow does not strand users on stale code.

---

## Dependency gates

These must be enforced. Do not begin a spec until its stated prerequisites are complete.

- **Outbox Sync Engine (Spec 6)** must not begin until **Idempotent Extraction Submit (Spec 5)** is complete. Automatic retry without idempotency creates duplicate quotes.
- **Audio upload in Outbox** must not begin until **Audio Blob Lifecycle Hardening (Spec 3)** is complete. Blobs must be durable before they can be reliably uploaded by the outbox.
- **PWA Shell Foundations (Spec 7)** must not cache authenticated API responses. Static app shell only.
- **Backend Infra Spec A — Redis Degraded Mode** runs in parallel with frontend steps 1–2 and must not block or gate any frontend offline-capture work.

---

## Cross-cutting decisions

### Auth and local data

P0 offline capture requires an authenticated user.

- Local captures are scoped by authenticated user id.
- On logout/account switch, pending local captures are hidden and must not be accessible to a different user.
- The same user can recover pending captures after signing back in.
- A future unauthenticated capture mode is out of scope.
- Do not store auth tokens, refresh tokens, API keys, or secrets in IndexedDB.

### Failure classification

Do not treat `navigator.onLine` as proof that the API is reachable. Sync/extract failures should be classified as:

```ts
type SubmitFailureKind =
  | "offline"
  | "timeout"
  | "auth_required"
  | "csrf_failed"
  | "validation_failed"
  | "server_retryable"
  | "server_terminal";
```

Retryable by default: `offline`, `timeout`, `server_retryable`.

Requires user action: `auth_required`, `csrf_failed`, `validation_failed`, `server_terminal`.

### Storage limits for V1

- Max clips per capture: 5 initially.
- Max clip duration: 2 minutes each initially.
- Max recoverable local captures shown: latest 20.
- Max local audio storage target: 100MB soft cap.
- Synced audio cleanup: delete local audio blobs after successful server quote hydration plus a short safety window, or sooner under storage pressure.

### PWA boundary

Offline Capture Workspace guarantees durable local data once the app shell is available. Cold offline launch is handled by the later PWA Shell Foundations spec.

---

## Definition of P0 complete

P0 is complete when a signed-in user can start a quote from the field, type notes, record clips, lose connection, close the app, reopen it, recover the session, sync it later, and receive exactly one editable quote draft without losing work.

This definition requires **all of Specs 0–7 plus Backend Infra Spec A** to be complete. Completing Spec 2 (Offline Capture Workspace) delivers notes-first local capture but does not satisfy full P0 — audio durability, outbox sync, idempotency, draft persistence, and PWA shell are still required.
