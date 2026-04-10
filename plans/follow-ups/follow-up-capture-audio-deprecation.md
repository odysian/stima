# Follow-up: Deprecate and remove `POST /quotes/capture-audio`

## What

`POST /quotes/capture-audio` (`backend/app/features/quotes/api.py`) has no active production callers.

`CaptureScreen` uses `POST /quotes/extract` (the unified endpoint). `quoteService.captureAudio()` exists in `frontend/src/features/quotes/services/quoteService.ts` but is only referenced in test mocks — never in a live component.

## Why deferred

Task 6b migrated `POST /quotes/extract` to async. `/capture-audio` was left synchronous to keep the task focused. Removing it was a separate concern that didn't belong in the async migration.

## Suggested cleanup

- Remove `POST /quotes/capture-audio` from `backend/app/features/quotes/api.py`
- Remove `captureAudio` from `frontend/src/features/quotes/services/quoteService.ts`
- Remove `captureAudio` mock stubs from frontend test files
- Verify no external integration tests or docs reference the route

## Not a blocker for

Tasks 6b, 6c, 6d, 7, or 8. Can be picked up as a standalone chore after 6b ships.
