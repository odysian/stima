## Summary

Unsaved line item edits on the review screen are silently discarded when the user taps "Add Voice Note" to go to append-capture and returns.

**Root cause (three-step failure):**

1. `onAddVoiceNote` in `ReviewScreen.tsx` calls `navigate(...)` directly — it bypasses `requestNavigation`, so the "unsaved changes" modal never fires even when `hasUnsavedChanges` is true.
2. While on the append-capture screen, the review screen is unmounted; local draft edits live only in `sessionStorage` via `useQuoteEdit`.
3. On return, `CaptureScreen` navigates back with `state: { reseedDraft: true }`. The review screen's reseed effect calls `refreshQuote({ reseedDraft: true })`, which fetches the server state and overwrites `sessionStorage` with `mapQuoteToEditDraft(refreshedQuote)` — discarding edits that were never saved to the backend.

## Files

- `frontend/src/features/quotes/components/ReviewScreen.tsx` (implementation)
- `frontend/src/features/quotes/tests/ReviewScreen.test.tsx` (tests)
- No changes to `ReviewFormContent.tsx` if using the `() => { void handleAddVoiceNote(); }` pattern.

## Scope

**In scope:**
- `ReviewScreen.tsx`: best-effort silent auto-save before navigating to append-capture (shared validation/payload with `saveDraft` where practical).

**Out of scope:**
- CaptureScreen, usePersistedReview, useQuoteEdit — no changes.
- Backend — no API or contract changes.
- The "Leave this screen?" modal behavior for other navigation targets (back, home).

## Acceptance Criteria

- [ ] When the user has unsaved line item edits and taps "Add Voice Note", the current draft is silently saved to the backend before navigation.
- [ ] On return from append-capture (`reseedDraft: true`), the freshly fetched server state now includes the previously-unsaved edits, so they are visible in the review form.
- [ ] If the auto-save fails (validation: no valid line items, pricing error) or a network error occurs, navigation still proceeds — no error UI is shown, no navigation is blocked. Edits may be lost in this edge case, which is the same behavior as today.
- [ ] No visible loading state or toast is shown for the auto-save — it is fully silent.
- [ ] Rapid double-taps on Capture more notes do not issue multiple `updateQuote` calls while the first silent save is still in flight (in-flight `useRef` guard; clear in `finally` so failures do not strand the handler).
- [ ] All existing review screen behavior is unaffected (save draft, continue to preview, leave warning modal for other targets).

## Tests

Primary case (extend the existing **Capture more notes** test in `ReviewScreen.test.tsx` so behavior stays covered in one place):

> _User edits a line item (or title), taps Capture more notes, `quoteService.updateQuote` resolves; assert `updateQuote` was called with the edited payload **before** `navigate` to the append-capture route._

Optional second case: invalid draft → `navigate` still fires, no successful persist.

Invariant: edits must reach the server before navigation when validation passes, not only after return.

## Implementation Plan

1. **Placement and DRY (`ReviewScreen.tsx`)** — Define the silent helper in the same block as `saveDraft` (after the loading/`activeDraft` guards), so it can reuse `quoteId`, `activeDraft`, `normalizedLineItems`, `lineItemsForSubmit`, `hasInvalidLineItems`, and `getPricingValidationMessage` without reordering the component. Prefer a small shared private helper (e.g. `function buildReviewUpdatePayload(): ... | null`) that returns `null` when validation fails and the `updateQuote` payload when valid; `saveDraft` keeps its UI side effects, `tryAutoSaveDraft` only calls `updateQuote` when the payload is non-null.

2. **`tryAutoSaveDraft`** — `async function tryAutoSaveDraft(): Promise<void>` that:
   - uses the same validation rules as `saveDraft` (valid line items, no invalid items, no pricing error)
   - if valid, `await quoteService.updateQuote(quoteId, payload)` with the same shape as `saveDraft`
   - wraps the API call in `try/catch` and swallows errors (no `setSaveError`, no `setToastMessage`, no `console.error` unless the codebase already logs there)
   - does **not** set `submitAction` (footer must not show saving/continuing)
   - does **not** call `refreshQuote` after success (review unmounts immediately; return path already reseeds from the server)

3. **Wire `onAddVoiceNote`** — Keep `ReviewFormContent`’s prop type as `onAddVoiceNote: () => void`. Add an `async function handleAddVoiceNote()` and pass `onAddVoiceNote={() => { void handleAddVoiceNote(); }}` so the return type stays `void` for TypeScript.

4. **In-flight guard (no duplicate PATCH)** — At the start of `handleAddVoiceNote`, if a `useRef` flag shows a run is already in progress, return immediately. Otherwise set the flag `true`, `await tryAutoSaveDraft()`, then `navigate(...)` — **navigation always runs** after the await, even when validation skipped the PATCH or the request failed. Set the flag `false` in `finally` so network errors still allow a later retry. No spinners or toasts — this only prevents accidental double-taps while the first request is outstanding.

5. **Tests (`ReviewScreen.test.tsx`)** — Extend or replace `it("opens append capture from the Capture More Notes action")`:
   - Resolve `quoteService.updateQuote` with a fulfilled promise (and ensure `getQuote` mocks stay consistent with existing `renderScreen` setup).
   - Change a field that appears in the PATCH payload (e.g. line item via the edit sheet, or title), tap Capture more notes, then assert **`updateQuote` was invoked before `navigateMock`** (e.g. compare `mock.invocationCallOrder` on both mocks, or spy call indices).
   - Add a short case where validation would fail (e.g. empty descriptions / pricing error if easy to reproduce in the harness): expect **`navigateMock` still called** and `updateQuote` not called (or not called with a successful path — match how you structure the test).

6. **Run frontend verification** — `make frontend-verify`.

**Note:** Save draft / continue already avoid double-submit via `submitAction` and `isInteractionLocked`; this guard applies only to the Capture more notes path.

## Decision Lock

**Chosen:** Auto-save (best-effort, silent) before navigating to append-capture.

**Alternative considered:** Smart merge on return — after append-capture, keep local line item edits and append only the newly-extracted server items instead of full reseed.

**Tradeoff:** Auto-save is simpler and more reliable for the common path (extraction always produces valid items). The merge approach handles the invalid-draft edge case but requires coordinating item counts across navigation boundaries and changes the reseed contract. Auto-save is the right call at this stage.

**Revisit trigger:** If users report edits being lost after a failed auto-save (e.g. persistent network issues during navigation), revisit the merge approach as a complementary fix.

## Verification

```bash
make frontend-verify
```

## Labels

`type:task`, `area:quotes`, `area:frontend`
