## Goal

When a user edits the quote on the review screen and taps **Capture more notes** (append-capture), those edits must reach the backend **before** navigation. On return, `reseedDraft: true` refreshes the draft from the server; without a prior save, unsaved edits are overwritten and lost.

## Scope

**In:**

- `frontend/src/features/quotes/components/ReviewScreen.tsx` — shared validation/payload with `saveDraft`, silent `tryAutoSaveDraft`, `handleAddVoiceNote` with in-flight `useRef` guard, no `submitAction` / toast / `setSaveError` for this path
- `frontend/src/features/quotes/tests/ReviewScreen.test.tsx` — extend/replace the existing “opens append capture” case; optional invalid-draft case

**Out:**

- `CaptureScreen`, `usePersistedReview`, `useQuoteEdit` — no changes
- Backend — no API or contract changes
- “Leave this screen?” modal behavior for back/home — unchanged

## Implementation notes

- Place helpers next to `saveDraft` (after `activeDraft` exists). Prefer `buildReviewUpdatePayload(): payload | null` shared by `saveDraft` and `tryAutoSaveDraft`.
- `tryAutoSaveDraft`: same validation as `saveDraft`; if valid, `await quoteService.updateQuote(...)`; swallow errors; do **not** call `refreshQuote` after success (unmount + return reseed handles freshness).
- `onAddVoiceNote`: `onAddVoiceNote={() => { void handleAddVoiceNote(); }}` so `ReviewFormContent`’s `() => void` typing stays valid.
- In-flight guard: second tap while first silent save is running → no second `updateQuote`; `finally` clears flag; **navigation always runs** after `await tryAutoSaveDraft()` (validation skip or network failure still navigates).
- Save draft / continue already use `submitAction` / `isInteractionLocked`; guard is only for Capture more notes.

**Planning reference (non-authoritative):** `plans/2026-04-09/task-review-autosave-before-append.md`

## Decision locks (backend-coupled only)

N/A — frontend-only; no backend or schema changes.

## Acceptance criteria

- [ ] User has unsaved line item (or other draft) edits and taps Capture more notes → current valid draft is silently persisted via `updateQuote` **before** `navigate` to append-capture.
- [ ] After append-capture returns with `reseedDraft: true`, the review form shows the previously unsaved edits (server state includes them).
- [ ] If auto-save is skipped (validation) or `updateQuote` fails, navigation still proceeds; no error UI, no blocked navigation (same worst case as today for invalid/failed save).
- [ ] No visible loading or toast for this path.
- [ ] Rapid double-taps do not issue multiple in-flight `updateQuote` calls for this handler (`useRef` + `finally`).
- [ ] Save draft, continue to preview, and leave-warning flows unchanged.

## First test

Extend `it("opens append capture from the Capture More Notes action")` (or equivalent): after editing payload-affecting fields, assert `quoteService.updateQuote` was called with expected payload **before** `navigate` to `/quotes/:id/review/append-capture`. Optionally: invalid draft → `navigate` still called, no successful persist.

## Verification

```bash
make frontend-verify
```

## PR checklist

- [ ] PR references this issue (`Closes #...`)
- [ ] Docs updated if needed (architecture/patterns/review checklist/ADR)
- [ ] Tests added/updated where needed
