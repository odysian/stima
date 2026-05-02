# SPEC-001G — Quote Review & Edit

**Parent umbrella:** `plans/react-native/SPEC-001-rn-expo-rewrite.md`
**Phase:** 3 Core Features
**Effort:** 5–7 days

## Goal

Port the review/edit screen for quotes and invoices: line item editing, customer assignment, pricing, status changes.

## References

- `frontend/src/features/quotes/components/ReviewScreen.tsx` — Main review screen with document type selector, customer row, line items section, action footer.
- `frontend/src/features/quotes/components/ReviewLineItemsSection.tsx` — Editable line item list with add/edit/delete.
- `frontend/src/features/quotes/components/LineItemEditSheet.tsx` — Bottom sheet for editing a line item (description, quantity, unit price).
- `frontend/src/features/quotes/components/ReviewCustomerRow.tsx` — Customer display + assignment sheet trigger.
- `frontend/src/features/quotes/components/ReviewCustomerAssignmentSheet.tsx` — Customer search/selection sheet.
- `frontend/src/features/quotes/components/ReviewActionFooter.tsx` — Actions: Save, Send, Convert to Invoice, Delete.
- `frontend/src/features/quotes/components/ReviewDocumentTypeSelector.tsx` — Toggle between quote and invoice.
- `frontend/src/features/quotes/components/DocumentEditScreenView.tsx` — Combined edit view wrapper.
- `frontend/src/features/quotes/components/DocumentEditOverlays.tsx` — Loading and error overlays.

## Acceptance Criteria

- [ ] Display quote/invoice header with status pill, created date, document number.
- [ ] Line items: editable list with swipe-to-delete or overflow menu.
- [ ] Line item edit modal with numeric fields for quantity/price, text field for description.
- [ ] Customer assignment: searchable list from local cache + API fallback.
- [ ] Pricing section: subtotal, tax, total with formatted currency.
- [ ] Action footer contextually shows: Save Draft, Send Quote, Approve & Invoice, Delete.
- [ ] Navigation guards for unsaved changes.

## Scope Notes

- Preserve current document lifecycle semantics. This spec ports the editing surface; it should not redefine quote/invoice state transitions.
