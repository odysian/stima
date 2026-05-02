# SPEC-001D — SQLite Schema & Offline Repositories

**Parent umbrella:** `plans/react-native/SPEC-001-rn-expo-rewrite.md`
**Phase:** 2 Storage Engine
**Effort:** 5–7 days

## Goal

Port all IndexedDB stores and repository logic to SQLite via `expo-sqlite` and Drizzle ORM.

## References

- `frontend/src/features/quotes/offline/captureDb.ts` — Store definitions, migration logic, connection handling, reset logic.
- `frontend/src/features/quotes/offline/captureRepository.ts` — Capture session CRUD, status marking, field updates.
- `frontend/src/features/quotes/offline/audioRepository.ts` — Audio clip persistence, blob storage.
- `frontend/src/features/quotes/offline/draftRepository.ts` — Local draft CRUD.
- `frontend/src/features/quotes/offline/outboxRepository.ts` — Outbox job CRUD, pending job listing, pause/unpause.
- `frontend/src/features/quotes/offline/captureSyncEventRepository.ts` — Sync event logging.
- `frontend/src/features/quotes/offline/captureTypes.ts` — Type definitions for local entities.

## Acceptance Criteria

- [ ] Drizzle schema files for all 5 stores: `capture_sessions`, `sync_events`, `audio_clips`, `local_drafts`, `outbox_jobs`.
- [ ] Equivalent indexes: `userId`, `status`, `sessionId`, `documentId`, etc.
- [ ] Repository functions match current signatures as closely as possible to minimize upstream changes.
- [ ] Audio clips: store metadata in SQLite; store blob on filesystem (`expo-file-system` cache directory). On iOS, handle `file://` URIs for upload.
- [ ] Native upload contract: local clip model includes `uri`, `name`, `type`, `sizeBytes`, `durationSeconds`. Extraction `FormData` uses native file attachments from filesystem URIs; it does not depend on browser `Blob` storage.
- [ ] Storage health checks and reset logic ported (see `storageHealth.ts`).
- [ ] All repository unit tests passing in Jest with mocked SQLite driver.

## Scope Notes

- Local storage choice locks in Phase 0: Drizzle ORM vs. direct `expo-sqlite` helpers.
- Preserve repository contracts first; schema polish can follow only if it does not create upstream churn.
