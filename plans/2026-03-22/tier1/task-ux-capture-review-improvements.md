# Task: Frontend UX improvements — staged loading, null-price warning, back-nav confirmation

**Mode:** single

## Summary

Three surgical frontend-only UX improvements targeting CaptureScreen and ReviewScreen. No API changes, no new endpoints, no backend work.

1. **Staged extraction loading** — Replace the single "loading spinner" during extraction with contextual progress messages so users know the 15-30s pipeline hasn't stalled.
2. **Null-price warning** — Show an inline warning on ReviewScreen when any line item has no price, before the user generates the quote.
3. **Back-nav confirmation** — Prompt before navigating away from CaptureScreen when clips or notes exist, preventing accidental data loss.

## Scope

### 1. Staged extraction loading (CaptureScreen)

**Problem:** `CaptureScreen` uses a single `isExtracting` boolean (line 35). During the 15-30s extraction pipeline, the user sees only a generic loading spinner with no feedback about what's happening.

**Solution:** Replace `isExtracting: boolean` with `extractionStage: string | null` state. Set contextual messages based on what was submitted:

```ts
const [extractionStage, setExtractionStage] = useState<string | null>(null);
const isExtracting = extractionStage !== null;
```

In `onExtract()`:
```ts
setExtractionStage(
  clips.length > 0 ? "Processing audio clips..." : "Analyzing notes..."
);

// After a short delay, update message if still extracting
const stageTimer = setTimeout(() => {
  setExtractionStage("Extracting line items...");
}, 4000);

try {
  const extraction = await quoteService.extract({ clips, notes });
  // ...
} finally {
  clearTimeout(stageTimer);
  setExtractionStage(null);
}
```

The `Button` component already accepts `isLoading` — keep that for the spinner. Add the stage message as a `<p>` above the footer button when `extractionStage` is set:

```tsx
{extractionStage ? (
  <p className="mb-2 text-center text-sm text-on-surface-variant">{extractionStage}</p>
) : null}
```

**Why timer-based, not SSE:** The backend extraction pipeline is a single POST. Adding SSE or chunked responses would be a disproportionate change. Timer-based messages give the user reassurance that something is happening without any backend changes. The messages are accurate because the pipeline stages are predictable (audio processing → transcription → extraction).

### 2. Null-price warning (ReviewScreen)

**Problem:** Users can generate a quote where some or all line items have `price: null`. The quote is technically valid (null means "not stated"), but users may not realize they're sending a quote with missing prices.

**Solution:** Add a non-blocking inline warning above the "Generate Quote" button when any visible line item has a null price.

Derive from existing state (no new state needed):
```ts
const hasNullPrices = lineItemsForSubmit.some((item) => item.price === null);
```

Render above the footer button (inside the `<footer>`):
```tsx
{hasNullPrices ? (
  <p className="mb-2 rounded-lg bg-warning-container px-3 py-2 text-center text-xs text-warning">
    Some line items have no price — the quote will show "TBD" for those items.
  </p>
) : null}
```

This uses the `warning` design tokens added in the design token sweep task. If this task runs before the token sweep, use the existing hardcoded amber classes (`bg-amber-50 text-amber-900`) as a temporary measure — the token sweep will replace them.

**Non-blocking:** The warning is informational only. It does not prevent submission. Users may intentionally leave prices null for "to be discussed" items.

### 3. Back-nav confirmation (CaptureScreen)

**Problem:** The back button on CaptureScreen (line 96) calls `navigate(-1)` with no confirmation. If the user has recorded clips or typed notes, tapping back loses everything.

**Solution:** Add a `showLeaveConfirm` boolean state. When the back button is tapped with unsaved work, set `showLeaveConfirm = true` instead of navigating. Render a `ConfirmModal` (new shared component — see below) when the flag is set.

```ts
const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

function hasUnsavedWork(): boolean {
  return clips.length > 0 || notes.trim().length > 0;
}

function onBack(): void {
  if (hasUnsavedWork()) {
    setShowLeaveConfirm(true);
    return;
  }
  navigate(-1);
}
```

```tsx
{showLeaveConfirm ? (
  <ConfirmModal
    title="Leave this screen?"
    body="Your clips and notes will be lost."
    confirmLabel="Leave"
    cancelLabel="Stay"
    onConfirm={() => navigate(-1)}
    onCancel={() => setShowLeaveConfirm(false)}
  />
) : null}
```

Wire the back button's `onClick` to `onBack` instead of the inline `() => navigate(-1)`.

**Why not `window.confirm`:** `window.confirm` is suppressed silently in mobile Safari standalone/PWA mode and some Android WebViews — the dialog never appears and it returns `false`, so the user navigates away without seeing any prompt. An inline modal avoids this entirely and is consistent with the app's visual style.

**Note:** This does not guard against browser back/swipe-back gestures. A `beforeunload` listener could help for browser navigation, but it doesn't work reliably with SPA `navigate()`. The button guard covers the primary case.

## New shared component — `ConfirmModal`

`src/shared/components/ConfirmModal.tsx` — bottom-sheet confirmation overlay following the design pattern in `stitch-design-notes.md`.

Props:
```ts
interface ConfirmModalProps {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "primary" | "destructive"; // confirm button style, default "primary"
}
```

`variant="destructive"` uses the terracotta button style for irreversible data loss actions (e.g. delete). `variant="primary"` (default) uses the forest gradient for neutral confirmations (leave, discard).

## Files touched

**New:**
- `frontend/src/shared/components/ConfirmModal.tsx`
- `frontend/src/shared/components/ConfirmModal.test.tsx`

**Modified:**
- `frontend/src/features/quotes/components/CaptureScreen.tsx` (staged loading + back-nav confirmation using `ConfirmModal`)
- `frontend/src/features/quotes/components/ReviewScreen.tsx` (null-price warning)

## Tests to add

**`ConfirmModal` component tests** (`ConfirmModal.test.tsx` — no mocks needed, pure render):
- Renders `title`, `body`, confirm label, and cancel label
- `onConfirm` callback fires when confirm button is clicked
- `onCancel` callback fires when cancel button is clicked
- `variant="destructive"` renders the confirm button with destructive styling
- `variant="primary"` (default) renders the confirm button with primary styling

**`CaptureScreen` component tests** (use `vi.mock` on `quoteService`, no MSW):
- Back button with unsaved clips: `ConfirmModal` is rendered, `navigate(-1)` is not called immediately
- Back button with unsaved notes: same as above
- Back button with no unsaved work: `navigate(-1)` is called immediately, no modal shown
- "Stay" in modal: modal is dismissed, user remains on screen
- "Leave" in modal: `navigate(-1)` is called
- Staged loading: while extraction is pending, a contextual message is visible; after resolution it is gone

**`ReviewScreen` component tests** (use `vi.mock` on `quoteService`):
- Null-price warning renders when at least one `lineItemsForSubmit` entry has `price: null`
- Null-price warning is absent when all line items have numeric prices
- Null-price warning does not disable the submit button (informational only)

## Acceptance criteria

- [ ] CaptureScreen shows contextual progress messages during extraction (not just a spinner)
- [ ] Progress message changes at least once during a multi-second extraction
- [ ] `ConfirmModal` shared component exists and is tested in isolation
- [ ] CaptureScreen back button shows `ConfirmModal` when clips or notes exist
- [ ] CaptureScreen back button navigates immediately when no clips or notes exist
- [ ] ReviewScreen shows a non-blocking warning when any submittable line item has `price: null`
- [ ] ReviewScreen warning is hidden when all line items have prices
- [ ] Warning does not block quote generation (informational only)
- [ ] All existing tests pass without modification
- [ ] All new component tests listed above pass
- [ ] No API changes, no backend changes

## Parity lock

- Status code parity: N/A (frontend-only, no API changes)
- Response schema parity: N/A
- Error semantics parity: same error messages, same rendering
- Side-effect parity: same service calls, same navigation targets (confirmation is additive)

## Verification

```bash
make frontend-verify
```
