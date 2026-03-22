## Task: Reskin Quote Flow Screens — CustomerSelect, Capture, Review + New EditLineItem Screen

**Type:** `type:task`
**Labels:** `area:frontend`, `area:quotes`, `area:customers`
**Depends on:**
- Design Foundation task (#37) — tokens, `AIConfidenceBanner`, `StatusBadge` must be merged first
- Combined Extract Endpoint task (#42) — `quoteService.extract()` must exist before the Capture screen reskin can remove the mode toggle. If #42 has not landed yet, implement the Capture screen reskin last and stub the call with the existing `convertNotes`/`captureAudio` functions temporarily, clearly marked with a `TODO(#42)` comment.

---

### Goal

Reskin the four screens that make up the core quote-creation flow. Also create `EditLineItemScreen` — a new screen that does not exist yet.

No service or API contract changes belong here (the `item_count` backend change is in the home screen task; the extract endpoint is in its own task).

### Non-Goals

- Do not change `quoteService.ts` extraction functions (that is the combined extract task)
- Do not change customer or quote API contracts
- Do not add voice transcription improvements

---

### Background and Design Reference

Design reference: `plans/2026-03-22/stitch-design-notes.md` section 3:
- "Customer Select — Search"
- "Customer Select — Create"
- "Capture Job Notes"
- "Review & Edit"
- "Edit Line Item (new screen — not yet implemented)"

Stitch HTML source (authoritative for exact class structure):
- `stitch_stima_home/customer_select_search/code.html`
- `stitch_stima_home/new_customer_create/code.html`
- `stitch_stima_home/capture_notes_idle_state_v2/code.html`
- `stitch_stima_home/capture_notes_active_recording_v2/code.html`
- `stitch_stima_home/review_edit_quote_final/code.html`
- `stitch_stima_home/edit_line_item_clean/code.html`
- `stitch_stima_home/edit_line_item_flagged/code.html`

**No bottom nav on any screen in this task.** BottomNav is NOT rendered during CustomerSelect, Capture, Review, or EditLineItem.

---

### Implementation Plan

**Step 1 — `CustomerSelectScreen.tsx`**

The component currently has two internal modes: `"search"` and `"create"`. Both get the same glassmorphism top app bar.

**Top app bar** (applies to both modes):
```tsx
<header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md shadow-[0_0_24px_rgba(13,28,46,0.04)] flex items-center px-4 h-16">
  <button className="mr-4 text-emerald-900 p-2 rounded-full hover:bg-slate-50 active:scale-95 transition-all" onClick={() => navigate(-1)}>
    <span className="material-symbols-outlined">arrow_back</span>
  </button>
  <div>
    <h1 className="font-headline font-bold tracking-tight text-primary text-lg">
      {mode === "search" ? "New Quote" : "New Customer"}
    </h1>
    {mode === "search" && (
      <p className="text-sm text-on-surface-variant">Select a customer to continue</p>
    )}
  </div>
</header>
```
Body needs `pt-16` to clear fixed header. Add `pb-24` for the fixed bottom button.

**Search mode:**
- Full-width `Input` search field (already client-side filters via `filteredCustomers`)
- Customer rows: `bg-surface-container-lowest rounded-lg p-4 mb-2 flex items-center justify-between`. Left: name `font-bold text-on-surface` + contact line `text-sm text-on-surface-variant`. Right: `<span className="material-symbols-outlined text-outline">chevron_right</span>`
- Empty state: `text-sm text-outline` centered

**Fixed bottom "ADD NEW CUSTOMER" button** (search mode only):
```tsx
<div className="fixed bottom-0 w-full p-4 bg-background/80 backdrop-blur-sm z-40">
  <Button variant="primary" onClick={onSwitchToCreateMode}>
    <span className="material-symbols-outlined mr-2 text-sm">person_add</span>
    ADD NEW CUSTOMER
  </Button>
</div>
```

**Create mode:**
- No separate section headers — stacked fields directly in the card body
- Fields: Full Name (required), Phone Number, Email Address, Address (multi-line `<textarea>` styled like `Input`)
- `"Create & Continue >"` — `Button variant="primary"`. The existing `onCreateCustomer` handler already navigates to `/quotes/capture/${createdCustomer.id}` on success — do not change this behaviour.

**Step 2 — `CaptureScreen.tsx`**

The current screen has a voice/text toggle (`mode` state). The Stitch design removes the toggle and shows both sections simultaneously. After the Combined Extract task (#42) lands, both clips and typed notes are sent together in one request. Until then, follow the fallback rule described in the dependencies section above.

**New CaptureScreen layout (voice + text simultaneously):**

Remove the mode toggle buttons entirely. Remove the separate `onSubmitVoice` and `onSubmitText` form handlers. Replace with a single `onExtract` handler:

```ts
async function onExtract(): Promise<void> {
  // After combined extract task lands:
  // const extraction = await quoteService.extract({ clips: clips.map(c => c.blob), notes });
  // applyDraft(clips.length > 0 ? "voice" : "text", extraction);

  // TODO(#42): Until combined extract endpoint lands, use legacy paths:
  if (clips.length > 0) {
    const extraction = await quoteService.captureAudio(clips.map(c => c.blob));
    applyDraft("voice", extraction);
  } else {
    const extraction = await quoteService.convertNotes(notes.trim());
    applyDraft("text", extraction);
  }
  navigate("/quotes/review");
}
```

Top app bar: back arrow + `"Capture Job Notes"` title + `"Describe the job and we'll extract the line items"` subtitle below title in `text-xs text-slate-500`.

**"RECORDED CLIPS" section:**
- Label row: `"RECORDED CLIPS"` in `font-headline text-sm font-semibold uppercase tracking-wide text-on-surface` left + clip count badge right
- Empty state card: `bg-surface-container-lowest border-2 border-dashed border-outline-variant/30 rounded-lg p-10 flex flex-col items-center gap-3`
  - Icon: `<span className="material-symbols-outlined text-4xl text-outline">mic_off</span>`
  - Text: `"No clips recorded yet"` in `text-sm text-outline`
- When clips exist: compact rows — play icon | `"Clip {n} · {duration}s"` | × delete button. Preserve existing `removeClip` logic.

**"WRITTEN DESCRIPTION" section:**
- Label: `"WRITTEN DESCRIPTION"` in same uppercase tracking style
- `<textarea>` with `Input`-equivalent styles + `rows={4}`

**Mic button — idle state:**
```tsx
<div className="flex flex-col items-center gap-3 my-6">
  <p className="text-xs uppercase tracking-widest text-outline">TAP TO START</p>
  <button
    className="w-20 h-20 rounded-full forest-gradient flex items-center justify-center shadow-[0_0_24px_rgba(0,0,0,0.12)] active:scale-95 transition-all"
    onClick={() => void startRecording()}
    disabled={!isSupported}
  >
    <span className="material-symbols-outlined text-white text-4xl">mic</span>
  </button>
</div>
```

**Mic button — active recording state** (when `isRecording === true`):
```tsx
<div className="flex flex-col items-center gap-3 my-6">
  <div className="flex items-center gap-2">
    <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
    <p className="text-sm text-secondary font-medium">Recording... {formatElapsed(elapsedSeconds)}</p>
  </div>
  <button
    className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center shadow-[0_0_24px_rgba(0,0,0,0.12)] active:scale-95 transition-all"
    onClick={stopRecording}
  >
    <span className="material-symbols-outlined text-white text-4xl">stop</span>
  </button>
</div>
```

**"Extract Line Items ✦" button** — pinned at bottom via `fixed bottom-0` or sticky container:
```tsx
<Button
  variant="primary"
  disabled={clips.length === 0 && notes.trim().length === 0}
  isLoading={isExtracting}
  onClick={() => void onExtract()}
>
  Extract Line Items ✦
</Button>
```

Disabled until at least one clip OR non-empty typed notes. The ✦ is a literal Unicode character in the label.

**Step 3 — `ReviewScreen.tsx` and new `LineItemCard.tsx`**

**Create `frontend/src/features/quotes/components/LineItemCard.tsx`:**

Props:
```ts
interface LineItemCardProps {
  description: string;
  details: string | null;
  price: number | null;
  flagged?: boolean;
  onClick: () => void;
}
```

Structure:
```tsx
<button
  className={`w-full bg-surface-container-lowest rounded-lg p-4 ghost-shadow text-left flex items-start justify-between gap-3 active:scale-[0.99] transition-all
    ${flagged ? "border border-amber-500/20" : ""}`}
  onClick={onClick}
>
  <div className="flex-1">
    <div className="flex items-center gap-2">
      <p className="font-bold text-on-surface">{description}</p>
      {flagged && (
        <span className="bg-amber-100 text-amber-700 text-[0.6875rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded">
          REVIEW
        </span>
      )}
    </div>
    {details && <p className="text-sm text-on-surface-variant mt-0.5">{details}</p>}
  </div>
  <div className="flex items-center gap-2 shrink-0">
    {price != null && <p className="font-bold text-on-surface">${price.toFixed(2)}</p>}
    <span className="material-symbols-outlined text-outline">chevron_right</span>
  </div>
</button>
```

**ReviewScreen layout:**
- Top app bar: back arrow + `"Review & Edit"` in `font-headline font-bold text-emerald-900`
- `AIConfidenceBanner` — render below app bar **only** when `confidenceNotes.length > 0` or any line item has `flagged === true`. Use `AIConfidenceBanner` shared component, join confidence notes into one message string.
- Section heading row: `"Line Items"` (`font-headline font-bold text-primary`) + `"X ITEMS EXTRACTED"` (`text-[0.6875rem] text-outline uppercase tracking-widest`) separated by `border-b border-outline-variant/20`
- Line item list: map over draft line items, render `LineItemCard` for each. On click, navigate to `/quotes/review/line-items/${index}/edit`.
- `"+ Add Manual Line Item"` button: `border-2 border-dashed border-outline-variant/30 rounded-lg py-3 w-full text-sm text-on-surface-variant flex items-center justify-center gap-2`. Appends blank line item to draft state.
- Totals section: `bg-surface-container-low rounded-lg p-4`. Row: `"Line Item Sum"` muted + auto-calculated sum. Row: `"TOTAL AMOUNT"` + large editable input allowing user override.
- `"CUSTOMER NOTES"` label + textarea
- `"Generate Quote >"` — `Button variant="primary"` pinned at bottom. Body needs `pb-24`.

**Step 4 — New `EditLineItemScreen.tsx` + route**

**Route** — add inside `<ProtectedRoute>` in `App.tsx`:
```tsx
<Route path="/quotes/review/line-items/:lineItemIndex/edit" element={<EditLineItemScreen />} />
```

`lineItemIndex` is an integer index into the draft line items array. Read it via `useParams` and parse with `parseInt`.

The draft state lives in `useQuoteDraft`. If `useQuoteDraft` does not expose a method to update a single item by index, add `updateLineItem(index: number, item: LineItemDraftWithFlags): void` and `removeLineItem(index: number): void` to it. Check the hook's current interface before deciding — do not add if already present.

**`EditLineItemScreen.tsx` layout:**
- Top app bar: back arrow navigates to `/quotes/review`. Below back arrow: `"REVIEW & EDIT"` breadcrumb in `text-xs text-outline uppercase tracking-wider` then `"Edit Line Item"` in `font-headline font-bold text-emerald-900`
- `AIConfidenceBanner` — only when `item.flagged === true`
- Fields (all using `Input` component):
  - Description (required): label row with `"Description"` left + `"REQUIRED"` right in `text-xs text-primary font-bold uppercase`
  - Details (optional): label row with `"Details"` left + `"OPTIONAL"` right in `text-xs text-outline font-bold uppercase`
  - Price (optional): label `"Price"`, input `placeholder="$ 0.00"` — store as string, parse to float on save, store `null` if empty
- `"Save Changes"` — `Button variant="primary"` full-width. Updates line item in draft via `updateLineItem(index, updatedItem)`, then `navigate("/quotes/review")`.
- `"Delete Line Item"` — `Button variant="destructive"` full-width below Save. Calls `removeLineItem(index)`, then `navigate("/quotes/review")`.

**Step 5 — Update tests**

- Update `CustomerSelectScreen.test.tsx`: top app bar renders, search filters customer list, "Add New Customer" shows create form, create form submits and navigates to capture route (existing behaviour, no change to assertion target).
- Update `CaptureScreen.test.tsx`: mode toggle is gone, both sections render simultaneously, extract button disabled when both clips and notes are empty, enabled when either is present, recording state changes mic button appearance.
- Update `ReviewScreen.test.tsx`: AI banner shown only with confidence notes or flagged items, line items render as `LineItemCard` components, tapping card navigates to edit route.
- Add `LineItemCard.test.tsx`: renders description/details/price, flagged state shows amber border and REVIEW badge, click fires `onClick`.
- Add `EditLineItemScreen.test.tsx`: loads correct item by index, Save updates draft and returns to `/quotes/review`, Delete removes item and returns, AI banner only when flagged.
- If `useQuoteDraft` gains new methods, add tests for them in `useQuoteDraft.test.tsx`.

---

### Acceptance Criteria

- [ ] All four screens have the glassmorphism top app bar with back arrow — no bottom nav on any of them
- [ ] `CustomerSelectScreen` search mode: customer rows with chevron; fixed bottom "ADD NEW CUSTOMER" primary button
- [ ] `CustomerSelectScreen` create mode: header changes to "New Customer"; "Create & Continue >" navigates to CaptureScreen after creation (existing behaviour preserved)
- [ ] `CaptureScreen` shows both "RECORDED CLIPS" and "WRITTEN DESCRIPTION" sections simultaneously — no mode toggle
- [ ] Idle state: green circular mic button with "TAP TO START" label
- [ ] Recording state: terracotta stop button with red dot + elapsed timer above it
- [ ] "Extract Line Items ✦" button disabled when both clips and notes are empty; enabled when either has content
- [ ] `LineItemCard` component exists; renders normal and flagged states correctly; click fires `onClick`
- [ ] `ReviewScreen` renders `AIConfidenceBanner` only when confidence notes exist or items are flagged
- [ ] Tapping a `LineItemCard` navigates to `/quotes/review/line-items/:index/edit`
- [ ] "Generate Quote >" is pinned at bottom with `pb-24` body padding
- [ ] `EditLineItemScreen` exists at route `/quotes/review/line-items/:lineItemIndex/edit` and is registered in `App.tsx`
- [ ] Save: updates line item in draft state, returns to `/quotes/review`
- [ ] Delete: removes item from draft state, returns to `/quotes/review`
- [ ] AI banner on EditLineItem renders only when item is flagged
- [ ] All existing feature tests for CustomerSelect, Capture, Review pass
- [ ] New tests for `LineItemCard` and `EditLineItemScreen` added and passing
- [ ] `make frontend-verify` passes cleanly

---

### Files in Scope

```
frontend/src/features/customers/components/CustomerSelectScreen.tsx
frontend/src/features/quotes/components/CaptureScreen.tsx
frontend/src/features/quotes/components/ReviewScreen.tsx
frontend/src/features/quotes/components/LineItemCard.tsx        (new)
frontend/src/features/quotes/components/EditLineItemScreen.tsx  (new)
frontend/src/App.tsx                                            (EditLineItem route only)
```

Conditionally in scope if `useQuoteDraft` needs new methods:
```
frontend/src/features/quotes/hooks/useQuoteDraft.ts
frontend/src/features/quotes/tests/useQuoteDraft.test.tsx
```

Tests to update/add:
```
frontend/src/features/customers/tests/CustomerSelectScreen.test.tsx
frontend/src/features/quotes/tests/CaptureScreen.test.tsx
frontend/src/features/quotes/tests/ReviewScreen.test.tsx
frontend/src/features/quotes/tests/LineItemCard.test.tsx         (new)
frontend/src/features/quotes/tests/EditLineItemScreen.test.tsx  (new)
```

---

### Files Explicitly Out of Scope

- All backend files
- `quoteService.ts`, `customerService.ts` — no API changes in this task
- `QuoteList.tsx`, `QuotePreview.tsx`, `SettingsScreen.tsx` — covered in other tasks

---

### Verification

```bash
make frontend-verify
```

Raw fallback:
```bash
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
