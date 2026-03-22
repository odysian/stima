# Task C: Quote deletion

**Parent Spec:** [Tier 2 — Quote UX & management improvements](spec-tier2-quote-ux-management.md)
**Mode:** gated child task
**Type:** feature (new endpoint + frontend UI)

## Summary

Add the ability to delete quotes. Currently abandoned or test quotes accumulate with no way to remove them. Hard delete for `draft` and `ready` quotes; shared quotes are protected (they have public URLs that may have been sent to customers).

## Scope

### 1. Backend: DELETE endpoint

**`api.py`** — Add `DELETE /api/quotes/{id}`:

```python
@router.delete(
    "/{quote_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
)
async def delete_quote(
    quote_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
) -> None:
    """Delete a user-owned quote."""
    try:
        await quote_service.delete_quote(user, quote_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
```

Returns 204 on success, 404 if not found/not owned, 409 if shared.

### 2. Backend: Update `QuoteRepositoryProtocol` and add service method

**`service.py`** — First, add `delete` to `QuoteRepositoryProtocol` (the `Protocol` class that defines the structural typing contract for `self._repository`):

```python
async def delete(self, document_id: UUID) -> None: ...
```

Without this, `mypy` will reject `self._repository.delete(quote_id)` in `delete_quote` because the declared type of `self._repository` is `QuoteRepositoryProtocol`, not the concrete `QuoteRepository`. The concrete class has the method at runtime, but mypy only sees the protocol type — so this line is required for `make backend-verify` to pass.

**`service.py`** — Then add `delete_quote()`:

```python
async def delete_quote(self, user: User, quote_id: UUID) -> None:
    """Delete a user-owned quote. Shared quotes cannot be deleted."""
    quote = await self._repository.get_by_id(quote_id, _resolve_user_id(user))
    if quote is None:
        raise QuoteServiceError(detail="Not found", status_code=404)

    if quote.status == QuoteStatus.SHARED:
        raise QuoteServiceError(detail="Shared quotes cannot be deleted", status_code=409)

    await self._repository.delete(quote_id)
    await self._repository.commit()
```

### 3. Backend: Repository method

**`repository.py`** — Add `delete()`:

```python
async def delete(self, document_id: UUID) -> None:
    """Hard-delete a document and its line items (cascade)."""
    await self._session.execute(
        delete(Document).where(Document.id == document_id)
    )
```

Line items are cascade-deleted via the existing `ForeignKey(ondelete="CASCADE")` relationship.

### 4. Frontend: Service function

**`quoteService.ts`** — Add `deleteQuote()`:

```ts
function deleteQuote(id: string): Promise<void> {
  return request<void>(`/api/quotes/${id}`, {
    method: "DELETE",
  });
}
```

### 5. Frontend: Delete button on QuotePreview

Add the delete button directly in `QuotePreview.tsx`, below the edit button added by Task B (or below `<QuotePreviewActions>` if Task B hasn't landed yet). It does not go inside `QuotePreviewActions` — same rationale as the edit button: keeps `QuotePreviewActions` scoped to generate/share and avoids prop-drilling.

The `isDeleting` and `deleteError` state variables live in `QuotePreview`. The `deleteError` is rendered inline in `QuotePreview` below the delete button, using `<FeedbackMessage variant="error">`.

Add a delete action, visible only for `draft` and `ready` quotes:

```tsx
{quote && quote.status !== "shared" ? (
  <button
    type="button"
    onClick={() => void onDelete()}
    className="w-full rounded-lg py-3 text-sm text-error transition-all active:scale-[0.98]"
    disabled={isDeleting}
  >
    {isDeleting ? "Deleting..." : "Delete Quote"}
  </button>
) : null}
```

**Confirmation:** Use the `ConfirmModal` shared component (created in Tier 1 UX task — will exist before this task executes) with `variant="destructive"`. Do NOT use `window.confirm` — it's suppressed silently in mobile Safari standalone/PWA mode.

```tsx
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

// Wire the delete button's onClick to show the modal:
onClick={() => setShowDeleteConfirm(true)}

// Render modal in the component:
{showDeleteConfirm ? (
  <ConfirmModal
    title={`Delete ${quote.doc_number}?`}
    body="This cannot be undone."
    confirmLabel="Delete"
    cancelLabel="Keep"
    variant="destructive"
    onConfirm={() => void onDelete()}
    onCancel={() => setShowDeleteConfirm(false)}
  />
) : null}
```

```ts
async function onDelete(): Promise<void> {
  if (!id || !quote) return;

  setShowDeleteConfirm(false);
  setIsDeleting(true);
  try {
    await quoteService.deleteQuote(id);
    navigate("/", { replace: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete quote";
    setDeleteError(message);
  } finally {
    setIsDeleting(false);
  }
}
```

On success, navigates to the quote list (`/`) with `replace: true` so the deleted quote's preview isn't in the back stack.

### 6. Frontend: Update QuotePreview state

Add `isDeleting`, `deleteError`, and `showDeleteConfirm` state variables to QuotePreview:

```ts
const [isDeleting, setIsDeleting] = useState(false);
const [deleteError, setDeleteError] = useState<string | null>(null);
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
```

Note: QuotePreview is currently 236 LOC (post-modularization). The delete button + handler + state adds ~25 LOC, keeping it well under the 450 LOC split threshold.

## Files touched

**Modified files:**
- `backend/app/features/quotes/api.py` (add DELETE endpoint)
- `backend/app/features/quotes/service.py` (add `delete_quote` method)
- `backend/app/features/quotes/repository.py` (add `delete` method)
- `frontend/src/features/quotes/services/quoteService.ts` (add `deleteQuote` function)
- `frontend/src/features/quotes/components/QuotePreview.tsx` (add delete button + handler)

## Acceptance criteria

- [ ] `DELETE /api/quotes/{id}` returns 204 for draft/ready quotes owned by the user
- [ ] `DELETE /api/quotes/{id}` returns 404 for non-existent or non-owned quotes
- [ ] `DELETE /api/quotes/{id}` returns 409 for shared quotes
- [ ] Line items are cascade-deleted with the document
- [ ] QuotePreview shows "Delete Quote" button for draft and ready quotes
- [ ] QuotePreview hides "Delete Quote" button for shared quotes
- [ ] Clicking delete shows a confirmation prompt
- [ ] On successful deletion, user is navigated to the quote list
- [ ] Backend tests cover: successful delete, not-found, not-owned, shared-quote rejection, cascade
- [ ] Frontend tests cover: delete button visibility by status, delete flow
- [ ] All existing tests pass

## Verification

```bash
make backend-verify
make frontend-verify
```
