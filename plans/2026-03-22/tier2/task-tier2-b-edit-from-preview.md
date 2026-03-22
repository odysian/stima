# Task B: Edit quote from preview

**Parent Spec:** [Tier 2 — Quote UX & management improvements](spec-tier2-quote-ux-management.md)
**Mode:** gated child task
**Type:** feature (new route + minor backend change)
**Depends on:** Task A (line items must be visible on QuotePreview so users can see what they're editing)

## Summary

Add the ability to edit a quote's line items, total, and notes after creation — directly from QuotePreview. Currently the only way to fix a mistake is to create a new quote from scratch.

## Scope

### 1. Backend: Revert status to `draft` on PATCH (service.py)

**Problem:** When a `ready` quote is edited via PATCH, its PDF becomes stale but the status stays `ready`. The user could share a quote that no longer matches its PDF.

**Solution:** In `QuoteService.update_quote()`, after applying the update, if the quote's status is `ready`, revert it to `draft`. This forces the user to regenerate the PDF before sharing.

**Note:** The revert fires unconditionally on any PATCH call, even if no field values actually changed (e.g. the user opens edit, changes nothing, and saves). This is intentional — detecting a true no-op would require comparing Pydantic input against ORM values, which adds complexity for a case that rarely happens and has no meaningful UX downside (the user just needs to regenerate the PDF one extra time).

```python
async def update_quote(self, user: User, quote_id: UUID, data: QuoteUpdateRequest) -> Document:
    quote = await self._repository.get_by_id(quote_id, _resolve_user_id(user))
    if quote is None:
        raise QuoteServiceError(detail="Not found", status_code=404)

    if quote.status == QuoteStatus.SHARED:
        raise QuoteServiceError(detail="Shared quotes cannot be edited", status_code=409)

    updated_quote = await self._repository.update(
        document=quote,
        total_amount=data.total_amount,
        update_total_amount="total_amount" in data.model_fields_set,
        notes=data.notes,
        update_notes="notes" in data.model_fields_set,
        line_items=data.line_items,
        replace_line_items="line_items" in data.model_fields_set,
    )

    # Revert to draft if a ready quote was edited — forces PDF regeneration
    if updated_quote.status == QuoteStatus.READY:
        updated_quote.status = QuoteStatus.DRAFT

    await self._repository.commit()
    return updated_quote
```

This is a minor behavioral addition to an existing endpoint (PATCH returns 409 for shared quotes, reverts ready→draft).

### 2. Frontend: Add edit button on QuotePreview

Add an "Edit Quote" button directly in `QuotePreview.tsx`, below the `<QuotePreviewActions>` block. It does not go inside `QuotePreviewActions` — that component is scoped to generate/share. Keeping it in `QuotePreview` avoids prop-drilling and leaves `QuotePreviewActions`'s interface stable.

```tsx
{quote && quote.status !== "shared" ? (
  <div className="px-4 mt-3">
    <button
      type="button"
      onClick={() => navigate(`/quotes/${id}/edit`)}
      className="w-full rounded-lg border border-outline-variant py-4 font-semibold text-on-surface-variant transition-all active:scale-[0.98]"
    >
      Edit Quote
    </button>
  </div>
) : null}
```

### 3. Frontend: Add edit screen route + component

**New route:** `/quotes/:id/edit` → `QuoteEditScreen`

**New file:** `frontend/src/features/quotes/components/QuoteEditScreen.tsx`

This screen is simpler than ReviewScreen because:
- No extraction/draft state — loads directly from the API via `quoteService.getQuote(id)`
- No AI confidence banner, no source type tracking
- Just the editable fields: line items, total, notes

**Key behaviors:**
- Loads the quote via `GET /api/quotes/{id}` on mount
- Initializes edit state from the response (see state management note below)
- Line items are displayed using the existing `LineItemCard` component
- Individual line item editing navigates to `/quotes/:id/edit/line-items/:index/edit`
- "Add line item" button at the bottom (same as ReviewScreen)
- Save button maps line items to `LineItemDraft[]` (strips `id` and `sort_order`) and calls `quoteService.updateQuote(id, { line_items, total_amount, notes })`
- On success, navigates back to `/quotes/${id}/preview`
- On error, shows error message inline using `<FeedbackMessage>`

**Estimated LOC:** ~150 (under budget). Reuses `LineItemCard`, `Button`, `ScreenHeader`, `ScreenFooter`, `FeedbackMessage`.

#### State management

React local state won't survive the navigation round-trip to `EditLineItemForEditScreen` and back. The solution mirrors the existing `useQuoteDraft` pattern:

1. **New file: `frontend/src/features/quotes/hooks/useQuoteEdit.ts`** (~30 LOC) — same shape as `useQuoteDraft` but uses storage key `stima_quote_edit`. Exposes `{ draft, setDraft, updateLineItem, removeLineItem, clearDraft }`.
2. `QuoteEditScreen` initializes `useQuoteEdit` on mount from the loaded `QuoteDetail`. It maps `LineItem[]` → `LineItemDraft[]` (drop `id` and `sort_order`) when seeding state.
3. `EditLineItemForEditScreen` (see §5) reads from and writes to `useQuoteEdit`, exactly as `EditLineItemScreen` does for `useQuoteDraft`.
4. `QuoteEditScreen` calls `clearDraft()` after a successful save or when the user cancels.

### 4. Frontend: Wire routes in App.tsx

Add two new routes:

```tsx
<Route path="/quotes/:id/edit" element={<ProtectedRoute><QuoteEditScreen /></ProtectedRoute>} />
<Route path="/quotes/:id/edit/line-items/:lineItemIndex/edit" element={<ProtectedRoute><EditLineItemForEditScreen /></ProtectedRoute>} />
```

### 5. Frontend: EditLineItemForEditScreen

**New file:** `frontend/src/features/quotes/components/EditLineItemForEditScreen.tsx` (~120 LOC)

Same form as `EditLineItemScreen` but:
- Uses `useQuoteEdit()` instead of `useQuoteDraft()`
- Reads `:id` and `:lineItemIndex` from `useParams`
- Navigates to `/quotes/:id/edit` on save and delete (not `/quotes/review`)
- Falls back to `/` if edit draft is missing (session cleared or direct navigation)

**Alternative considered:** Parameterizing `EditLineItemScreen` to accept a storage hook and back path. Rejected — would add props to an already-stable component and add complexity for a V1 feature. A dedicated screen is explicit and isolated.

**Decision brief:**
- **Chosen:** Separate screen + separate storage key
- **Alternative:** Shared screen with injected storage context
- **Tradeoff:** ~120 LOC of near-duplication vs. coupling `EditLineItemScreen` to two different data sources
- **Revisit trigger:** If a third edit context emerges, extract a shared `EditLineItemForm` component

## Files touched

**New files:**
- `frontend/src/features/quotes/components/QuoteEditScreen.tsx` (~150 LOC)
- `frontend/src/features/quotes/components/EditLineItemForEditScreen.tsx` (~120 LOC)
- `frontend/src/features/quotes/hooks/useQuoteEdit.ts` (~30 LOC)

**Modified files:**
- `backend/app/features/quotes/service.py` (add shared-quote guard + ready→draft revert in `update_quote`)
- `frontend/src/features/quotes/components/QuotePreview.tsx` (add edit button below `<QuotePreviewActions>`)
- `frontend/src/App.tsx` (add two routes: `/quotes/:id/edit` and `/quotes/:id/edit/line-items/:lineItemIndex/edit`)

## Acceptance criteria

- [ ] QuotePreview shows "Edit Quote" button for `draft` and `ready` quotes
- [ ] QuotePreview hides "Edit Quote" button for `shared` quotes
- [ ] Clicking "Edit Quote" navigates to `/quotes/{id}/edit`
- [ ] QuoteEditScreen loads quote data and allows editing line items, total, notes
- [ ] Saving changes calls `PATCH /api/quotes/{id}` and navigates back to preview
- [ ] PATCH on a `ready` quote always reverts status to `draft` (including no-op saves)
- [ ] PATCH on a `shared` quote returns 409
- [ ] After editing a ready quote, QuotePreview shows status as `draft` (user must regenerate PDF)
- [ ] Backend tests cover: ready→draft revert, shared quote 409 rejection
- [ ] Frontend tests cover: edit button visibility by status, save flow
- [ ] All existing tests pass (with targeted additions for new behavior)

## Parity lock (for the PATCH behavioral change)

- Status code parity: adds 409 for shared quotes (new behavior, not a regression)
- Response schema parity: unchanged
- Error semantics: new error case (`"Shared quotes cannot be edited"`) — additive
- Side-effect parity: ready→draft status change is new intentional behavior

## Verification

```bash
make backend-verify
make frontend-verify
```
