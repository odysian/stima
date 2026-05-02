# SPEC-001E — Outbox Engine Port

**Parent umbrella:** `plans/react-native/SPEC-001-rn-expo-rewrite.md`
**Phase:** 2 Storage Engine
**Effort:** 3–4 days

## Goal

Port the background sync engine that retries failed capture submissions when connectivity returns.

## References

- `frontend/src/features/quotes/offline/outboxEngine.ts` — Core engine: `runOutboxPass`, `registerOnlineTrigger`, job processing, retry backoff, terminal failure handling.
- `frontend/src/features/quotes/offline/classifySubmitFailure.ts` — Maps errors to `offline` | `timeout` | `server_retryable` | `auth_required` | `validation_failed` | `server_terminal`.
- `frontend/src/features/quotes/offline/OutboxSyncCoordinator.tsx` — React component that listens for `online` events and triggers outbox passes.
- `frontend/src/features/quotes/components/captureScreenHelpers.ts` — Extraction polling constants (`EXTRACTION_MAX_POLLS`, `EXTRACTION_POLL_INTERVAL_MS`).

## Acceptance Criteria

- [ ] `runOutboxPass(userId)` executes identically: loads pending jobs, processes each, handles extraction timeout, polls for persisted quote.
- [ ] Retry backoff: `BACKOFF_BASE_MS * 2^(attempt-1)` capped at `BACKOFF_MAX_MS`.
- [ ] `registerOnlineTrigger` uses `@react-native-community/netinfo` instead of `window.addEventListener('online')`.
- [ ] Terminal failures mark capture status as `extract_failed` and emit sync events.
- [ ] Auth-required pauses block the outbox until explicit re-auth or `forceAfterAuth`.
- [ ] Foreground reconnect sync is required. Outbox runs when app opens, when auth is verified, and when NetInfo reports connection restored.
- [ ] BackgroundTask is optional best-effort only. Do not rely on `expo-background-task` for correctness; it is deferrable, OS-controlled, and may not run immediately.

## Scope Notes

- Foreground-first durability is the contract. Background execution is a later optimization, not a correctness mechanism.
