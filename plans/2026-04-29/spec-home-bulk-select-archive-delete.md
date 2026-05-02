# Rough Spec: Home Screen Bulk Selection, Archive, and Safe Delete

## Status

Canonical for GitHub Spec #652 (locked decisions). Local agents: read this file before child Tasks #653-#656.

**Type:** `spec`
**Child issues:** 4 Tasks (type: `task`)

## Context

Stima currently lets users manage quotes, invoices, and pending captures from the home screen, but there is no first-class way to clean up multiple quotes/invoices/drafts at once. Users can end up with old drafts, ready quotes, shared quotes, and invoices cluttering the home screen.

The goal is to add a simple mobile-friendly bulk selection mode that supports cleanup without making document deletion unsafe.

This should be treated as a document lifecycle feature, not just a UI convenience. Quotes and invoices can be linked, and some documents may have been shared with customers. The backend must decide whether a selected document can be permanently deleted.

## Product Direction

Use two different actions with two different promises:

- **Archive**: remove from the active home screen while preserving the document record.
- **Delete permanently**: hard-delete only when the backend determines the document is safe to destroy.

The home screen cleanup action should be **Archive-first**. Delete should exist, but it should be less prominent and protected by backend eligibility checks.

## V1 User Experience

### Normal Home Screen

Add a vertical overflow menu button (`⋮`) to the top control row on the home screen, to the right of the existing search button.

Current rough layout:

```text
[Quotes / Invoices toggle]                         [Search] [⋮]
```

Overflow menu options:

```text
Select
```

### Entering Selection Mode

When the user taps `Select`:

- The current document tab enters selection mode.
- Selection is scoped to the current tab only: Quotes or Invoices.
- The Quotes/Invoices toggle should be disabled while selection mode is active for V1.
- Existing search/filter state should be preserved, so users can search first and then select from filtered results.
- The New Quote FAB should be hidden while selection mode is active.
- The bottom navigation should remain visible.
- A sticky selection footer should appear above the bottom navigation.
- Pending captures are not selectable. Selection mode applies only to persisted quotes and invoices.

### Row Behavior in Selection Mode

Document rows should render a checkbox on the left side of each row.

This should be visually similar to the existing left-side row controls used by line items on the review screen.

Behavior:

- Tapping a checkbox toggles selection.
- Tapping anywhere on the row toggles selection.
- Rows should not navigate to detail/edit pages while selection mode is active.
- Selected rows should have a clear selected visual state.

### Selection Footer

The selection footer should sit above the bottom nav and should not replace the bottom nav.

Normal mode:

```text
Document list
FAB
Bottom nav
```

Selection mode:

```text
Document list
Selection footer
Bottom nav
```

The FAB should be hidden during selection mode.

Footer when no rows are selected:

```text
0 selected                                      Cancel
```

Footer when one or more rows are selected:

```text
2 selected                         Archive      More
```

`More` menu options for V1:

```text
Delete permanently...
Cancel selection
```

Do not add context-aware actions like `Void invoice` or `Revoke share` in V1. Those are valid future actions, but they should not block the base selection/archive/delete system.

## V1 Actions

### Archive Selected

Archive is the main cleanup action.

Archive should remove selected documents from the active home screen but preserve their records.

Confirmation modal:

```text
Archive 3 documents?

Archived documents are removed from the home screen.

[Cancel] [Archive]
```

Archiving removes documents from default lists. There is no Archived view or filter in V1; retrieval will be a follow-up feature.

### Delete Permanently

Delete is destructive and should live behind the `More` menu.

Delete should not silently archive ineligible documents. If the user chooses delete, the backend should delete only eligible records and report blocked records.

Confirmation modal before execution:

```text
Delete selected documents permanently?

Only documents that are safe to delete will be removed. Shared, linked, or customer-facing documents may be blocked.

This cannot be undone.

[Cancel] [Delete permanently]
```

After execution, show a result toast/banner:

```text
2 documents deleted. 1 could not be deleted because it has a linked invoice.
```

or:

```text
No documents were deleted. Selected documents are shared, linked, or customer-facing.
```

## Backend Safety Policy

The backend is the source of truth for whether a document can be deleted or archived. The frontend may hide/disable actions for better UX, but backend policy must re-check ownership, type, lifecycle state, share state, and links at execution time.

### Hard Delete Policy

Hard delete is for abandoned work, not customer-facing history.

**V1 supports delete only for quotes.** Invoice delete is blocked with `invoice_delete_not_supported`.
Delete safety should be enforced both in backend policy and at the database relationship layer so a quote with a referencing invoice cannot be hard-deleted even if an application path forgets to pre-check eligibility.

A quote can be hard-deleted only if all are true:

- It belongs to the authenticated user.
- It has `doc_type = quote`.
- It is in a deletable lifecycle state.
- It has not been shared/viewed/approved/declined.
- It has no linked invoice, including archived linked invoices.

A quote should not be hard-deleted if:

- It has a linked invoice, including an archived linked invoice.
- It has been shared.
- It has been viewed by a customer.
- It is approved or declined.

**Existing single-quote delete must reuse the same stricter policy.** The current `DELETE /api/quotes/{quote_id}` endpoint only checks status; V1 must also block quotes with a linked invoice and must verify `doc_type = quote`.
**Existing single-quote frontend affordances should align with that policy.** In Quote Preview, `Delete Quote` should not be shown when the quote already has a linked invoice.

### Archive Policy

Archive should be broadly available for cleanup.

A document can be archived if:

- It belongs to the authenticated user.
- It is a supported document type for the current action.
- It is not already archived.

Archive is a visibility flag only. It must not mutate document status.

Archive should not break links, public share rules, invoice history, document numbers, or event logs.

Archiving should hide the document from:

- Default home quote and invoice lists.
- Customer detail quote/invoice history lists.
- Quote reuse candidate lists.

Archived documents must not revoke public share links and must not break `source_document_id` / linked invoice relationships.

## Backend API Shape

V1 uses **feature-scoped bulk action endpoints** to stay within the existing `quotes` and `invoices` feature modules.

### Quote Bulk Action

```http
POST /api/quotes/bulk-action
```

Dependencies: `require_csrf`

Request:

```json
{
  "action": "delete",
  "ids": ["quote-id-1", "quote-id-2"]
}
```

Supported actions:

```text
archive
delete
```

Response (`200 OK`):

```json
{
  "action": "delete",
  "applied": [
    {
      "id": "quote-id-1"
    }
  ],
  "blocked": [
    {
      "id": "quote-id-2",
      "reason": "linked_invoice",
      "message": "Quotes with a linked invoice cannot be deleted.",
      "suggested_action": "archive"
    }
  ]
}
```

### Invoice Bulk Action

```http
POST /api/invoices/bulk-action
```

Dependencies: `require_csrf`

Request:

```json
{
  "action": "archive",
  "ids": ["invoice-id-1", "invoice-id-2"]
}
```

Supported actions for V1:

```text
archive
```

`delete` is accepted at the API level for invoices but every invoice is blocked at execution time with `reason: "invoice_delete_not_supported"`. The endpoint does not schema-reject the action.

Response (`200 OK`):

```json
{
  "action": "archive",
  "applied": [
    {
      "id": "invoice-id-1"
    },
    {
      "id": "invoice-id-2"
    }
  ],
  "blocked": []
}
```

### Behavior Rules

- The endpoint returns `200 OK` for mixed applied/blocked results. Auth/CSRF failures return their usual 401/403 status codes; they are not represented inside the `blocked` array.
- For bulk actions, per-document ownership or eligibility failures are reported in `blocked`; they do not short-circuit the whole batch into a top-level 404/409 response.
- Invalid UUIDs, unsupported action values, or an empty `ids` list return request-level `422 Unprocessable Entity`; they are not represented inside `blocked`.
- Existing single-document `DELETE /api/quotes/{id}` should keep its normal route-level missing/not-owned behavior while reusing the tightened delete eligibility policy.
- The execute endpoint must re-check eligibility at action time.
- Bulk actions are best-effort per document. One document failing should not prevent other documents from being processed.
- Archive visibility filters apply only to owner-facing discovery surfaces:
  - default home quote and invoice lists
  - customer detail quote/invoice history lists
  - quote reuse candidate lists
- Archive visibility filters must not be applied to relationship/policy checks such as `QuoteRepository.has_linked_invoice(...)`, `InvoiceRepository.get_by_source_document_id(...)`, or quote-to-invoice conversion guards.

## Data Model Considerations

### `archived_at` timestamp

Add nullable `archived_at` to the document model.

Pros:

- Simple.
- Keeps status lifecycle separate from visibility state.
- Allows future "Archived" filter.
- Does not overload quote/invoice status.

Requirements:

- Migration must include an index on `archived_at` (or a composite index on `(user_id, archived_at)`) to avoid full table scans on home list queries.

### Linked quote/invoice delete safety

The current quote/invoice link should keep its existing shape for V1, but delete safety should be hardened at the database layer in addition to backend policy.

Requirements:

- Update the SQLAlchemy model `Document.source_document_id` `ForeignKey(..., ondelete=...)` definition to match the new constraint behavior so model metadata and the database do not drift.
- Add a new migration that updates the quote/invoice relationship so a quote cannot be hard-deleted while an invoice still references it.
- Do not rely only on application-layer checks to preserve `source_document_id` provenance.

## Existing Areas Likely Affected

Frontend:

- `frontend/src/features/quotes/components/QuoteList.tsx`
- `frontend/src/features/quotes/components/DocumentRowsSection.tsx`
- `frontend/src/ui/QuoteListRow.tsx`
- document list services for quotes/invoices
- new `useDocumentSelection` hook
- new `DocumentSelectionFooter` component
- possible new shared selection footer/menu components

Backend:

- quote deletion service/policy (add linked-invoice check)
- existing `DELETE /api/quotes/{id}` route (reuse tightened policy)
- quote repository list filtering (`list_by_user`, `list_reuse_candidates`)
- invoice repository list filtering (`list_by_user`)
- customer detail quote/invoice history filtering
- new `POST /api/quotes/bulk-action` route/service/repository
- new `POST /api/invoices/bulk-action` route/service/repository
- schema/model migration for `archived_at` with index

Known current behavior to preserve:

- Quote deletion already blocks shared/viewed/approved/declined quotes.
- Quote lists distinguish drafts and past quotes.
- Invoices are listed separately under the Invoices tab.
- The New Quote FAB sits above bottom nav in normal mode and should be hidden during selection mode.

Frontend component budget:

- `QuoteList.tsx` is already ~436 lines. Do not bloat it. Extract selection logic into `useDocumentSelection` hook (target ≤180 LOC) and `DocumentSelectionFooter` component (target ≤250 LOC).

## Frontend State Shape Suggestion

Extract selection state into `useDocumentSelection` rather than inlining it in `QuoteList.tsx`.

```ts
type SelectionDocumentType = "quote" | "invoice";

type SelectedDocument = {
  id: string;
  doc_type: SelectionDocumentType;
};

const [isSelectionMode, setIsSelectionMode] = useState(false);
const [selectedDocuments, setSelectedDocuments] = useState<SelectedDocument[]>([]);
```

`DocumentRow` needs `doc_type: "quote" | "invoice"` added so the selection footer knows which bulk endpoint to call.

Selection should reset when:

- User cancels selection.
- Bulk action completes.
- User signs out.
- Current document tab changes, if tab changing remains enabled.

Preferred V1: disable tab switching while selection mode is active.

## Accessibility Requirements

- Overflow button has an accessible label, e.g. `More document actions`.
- Select menu item is keyboard accessible.
- Checkboxes have labels that include the document number/customer/title where possible.
- Selection footer announces selected count.
- Destructive delete confirmation uses clear wording and requires explicit confirmation.
- Selection mode should not trap focus.
- Escape key may cancel menus/modals where existing app patterns support it.

## Testing Guidance

### Backend Tests

Add tests for bulk action policy:

- Can archive owned quote.
- Can archive owned invoice.
- Cannot archive another user’s document.
- Archived documents are hidden from default quote list.
- Archived documents are hidden from default invoice list.
- Can delete draft/ready unshared quote with no linked invoice.
- Cannot delete shared/viewed/approved/declined quote.
- Cannot delete quote with linked invoice, including archived linked invoices.
- Cannot delete quote that is not owned by the current user.
- Cannot delete a document with `doc_type != quote` through the quote endpoint.
- Invoice delete is blocked in V1 with `invoice_delete_not_supported`.
- Bulk action returns `200 OK` with partial success (`applied` + `blocked`).
- Execute endpoint re-validates policy at action time.
- Existing single-quote `DELETE /api/quotes/{id}` also blocks linked invoices.
- Database relationship rules also prevent deleting a quote while an invoice still references it.
- Existing Quote Preview single-delete affordance hides `Delete Quote` when a linked invoice exists.
- Archived documents are hidden from customer detail quote/invoice history lists.
- Archived documents are hidden from quote reuse candidate lists.
- Public share links still work for archived documents.
- `source_document_id` / linked invoice relationships survive archiving.

### Frontend Tests

Add tests for home selection behavior:

- Overflow menu opens and contains `Select`.
- Tapping `Select` enters selection mode.
- Rows render left-side checkboxes in selection mode.
- Tapping a row toggles selection instead of navigating.
- Selected count updates.
- FAB is hidden in selection mode.
- Bottom nav remains rendered.
- Selection footer renders above bottom nav.
- Archive action opens confirmation.
- Delete action is behind More menu.
- Cancel exits selection mode and clears selected documents.
- Bulk action result shows applied/blocked feedback.
- Pending captures are not selectable.
- Selection logic is extracted into a hook, not inlined in `QuoteList.tsx`.
- Existing Quote Preview hides `Delete Quote` when a linked invoice exists.

## Acceptance Criteria

- Home screen has a top-right overflow menu next to search.
- Overflow menu includes `Select`.
- Selection mode is scoped to the active tab only.
- Selection mode displays checkboxes on the left side of document rows.
- Row click toggles selection instead of navigation while selecting.
- New Quote FAB is hidden during selection mode.
- Bottom navigation remains visible during selection mode.
- Sticky selection footer appears above bottom nav.
- Footer shows selected count.
- Footer exposes `Archive` as the primary action when one or more rows are selected.
- Footer exposes `More`, with `Delete permanently...` and `Cancel selection`.
- Archive removes selected eligible documents from default home lists without deleting records.
- Archived documents are hidden from customer detail history lists and quote reuse candidate lists.
- Archived documents do not revoke public share links and do not break `source_document_id` / linked invoice relationships.
- Delete permanently only deletes backend-eligible documents.
- Backend blocks hard delete for shared/viewed/approved/declined quotes.
- Backend blocks hard delete for quotes with linked invoices, including archived linked invoices.
- Backend blocks hard delete for documents that are not `doc_type = quote`.
- Existing single-quote `DELETE /api/quotes/{id}` reuses the same stricter policy (blocks linked invoices).
- Database relationship rules prevent deleting a quote while an invoice still references it.
- Existing Quote Preview single-delete affordance hides `Delete Quote` when a linked invoice exists.
- Backend returns `200 OK` with per-document `applied` and `blocked` arrays.
- Mutating bulk endpoints require CSRF.
- Frontend shows useful feedback when some selected documents are blocked.
- Pending captures are not selectable.
- V1 does not add void/revoke-share/context-aware lifecycle actions.
- V1 does not add select-all, long-press, or swipe gestures.
- Frontend extracts selection logic into dedicated hooks/components rather than bloating `QuoteList.tsx`.

## Acceptance Criteria Ownership Map

- Task 1 owns archive visibility semantics: archived documents are hidden from default home lists, customer detail history lists, and quote reuse candidate lists without deleting records.
- Task 2 owns backend archive/delete execution contracts and link-safety enforcement: feature-scoped bulk endpoints, CSRF, best-effort `applied`/`blocked` results, delete eligibility policy, invoice delete blocking, tightened single-quote delete policy, and database-level protection against deleting a quote that still has a referencing invoice.
- Task 3 owns frontend selection shell behavior only: overflow menu, selection mode, row checkbox/toggle behavior, sticky footer shell, FAB/bottom-nav behavior, pending-capture exclusion, and hook/component extraction.
- Task 4 owns frontend wiring to backend contracts and delete-affordance alignment: confirmation modals, endpoint calls, blocked-result feedback, list refresh, selection reset after action, and hiding Quote Preview single-delete when `linked_invoice` exists.

## Non-Goals

- No bulk voiding invoices in V1.
- No bulk revoke-share in V1.
- No automatic mixed delete-archive behavior when the user chooses delete.
- No cascading delete of linked quote/invoice relationships.
- No cross-tab selection across Quotes and Invoices in V1.
- No permanent deletion of customer-facing document history.
- No complex context-aware action menu beyond Archive + More/Delete.
- No select-all checkbox or action in V1.
- No long-press or swipe-to-select gestures in V1.
- No Archived filter/view in V1 (follow-up only).
- Archive is not reversible in V1 (requires Archived view follow-up).

## Resolved Questions

1. ~~Should V1 implement a document-level `/documents/bulk-action` endpoint, or quote/invoice-specific endpoints?~~ **Resolved:** Feature-scoped endpoints (`/api/quotes/bulk-action`, `/api/invoices/bulk-action`).
2. ~~Should V1 include an Archived filter/view, or should that be a follow-up?~~ **Resolved:** Follow-up only.
3. ~~Should invoice hard delete be completely blocked in V1?~~ **Resolved:** Completely blocked.
4. ~~Should `archived_at` be the chosen model field?~~ **Resolved:** `archived_at` is the chosen model field.
5. ~~Should archived documents still appear in customer detail/history views?~~ **Resolved:** Hidden from customer detail history lists.
6. ~~Should archive be reversible in V1, or only once an Archived view exists?~~ **Resolved:** Not reversible in V1.

## Recommended Issue Split

This is likely too large for one implementation PR unless kept very tight. Suggested split:

### Task 1 (#653): Backend archive visibility model

- Add `archived_at` to documents with index.
- Hide archived documents from default quote list endpoint (`list_by_user`).
- Hide archived documents from default invoice list endpoint (`list_by_user`).
- Hide archived documents from customer detail quote history lists.
- Hide archived documents from customer detail invoice history lists.
- Hide archived documents from quote reuse candidate lists (`list_reuse_candidates`).
- Add archive service/repository behavior.
- Keep archive visibility-only; do not mutate document status.
- Archive remains non-reversible in V1 because there is no Archived view/filter yet.
- Apply archive filters only to owner-facing discovery/list/history/reuse surfaces; do not apply them to linked-document relationship checks.
- Add tests.

### Task 2 (#654): Backend safe bulk action endpoints

- Add bulk action schemas for quotes and invoices.
- Add `POST /api/quotes/bulk-action` supporting `archive` and `delete`.
- Add `POST /api/invoices/bulk-action` supporting `archive` only (`delete` blocked).
- Reuse/extend quote deletion policy; add linked-invoice check.
- Tighten existing `DELETE /api/quotes/{id}` to match the same policy.
- Block linked/shared/customer-facing deletes, including when the linked invoice is archived.
- Update the SQLAlchemy model `Document.source_document_id` `ForeignKey(..., ondelete=...)` definition to match the hardened relationship constraint.
- Add database-level delete safety so a quote cannot be hard-deleted while an invoice still references it.
- Keep linked-invoice policy checks and quote-to-invoice conversion checks archive-agnostic; archived linked invoices still count as existing links.
- For bulk endpoints, report non-owned/ineligible documents in `blocked` while preserving top-level `200 OK` partial-success semantics.
- Return `200 OK` with `applied`/`blocked` arrays.
- Require CSRF on mutating endpoints.
- Add tests.

### Task 3 (#655): Frontend selection mode shell

- Add overflow menu with `Select`.
- Add selection mode state.
- Add row checkboxes.
- Hide FAB.
- Render sticky selection footer above bottom nav.
- Keep actions stubbed or wired to no-op pending backend; no backend calls, endpoint assumptions, or result messaging in this task.

### Task 4 (#656): Frontend wire bulk actions

- Wire archive/delete to backend.
- Route actions by active tab: quotes use `POST /api/quotes/bulk-action`; invoices use `POST /api/invoices/bulk-action`.
- Invoice-tab delete still goes through the invoice bulk endpoint and surfaces backend-blocked `invoice_delete_not_supported` feedback.
- Align existing Quote Preview single-delete affordance with the tightened backend policy by hiding `Delete Quote` when `linked_invoice` exists.
- Add confirmation modals.
- Add success/partial-blocked feedback.
- Refresh lists after action.
- Reset selection after completion.
- Add tests.

If the team wants a smaller first PR, combine Tasks 3 and 4 only after backend is available.
