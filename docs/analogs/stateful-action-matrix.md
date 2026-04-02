# Stateful Action Matrix

Use this analog when one screen exposes different actions, labels, or side effects based on document status, local transient state, or cross-layer contract rules.

## When To Use

- Adding or changing status-driven action visibility
- Changing which actions are enabled, disabled, or hidden during async mutations
- Introducing new document outcomes or status transitions
- Refactoring a stateful screen while preserving action parity

## Canonical Examples

- `frontend/src/features/quotes/components/QuotePreview.tsx`
- `frontend/src/features/quotes/components/QuotePreviewActions.tsx`
- `frontend/src/features/quotes/components/quotePreview.helpers.ts`
- `frontend/src/features/quotes/components/QuotePreviewDialogs.tsx`
- `frontend/src/features/quotes/utils/quoteStatus.ts`
- `backend/app/features/quotes/service.py`
- `frontend/src/features/invoices/components/InvoiceDetailScreen.tsx`
- `frontend/src/features/invoices/utils/invoiceStatus.ts`
- `backend/app/features/invoices/service.py`
- `docs/ARCHITECTURE.md`
- `frontend/src/features/quotes/tests/QuotePreview.test.tsx`
- `frontend/src/features/quotes/tests/QuotePreviewActions.test.tsx`
- `frontend/src/features/invoices/tests/InvoiceDetailScreen.test.tsx`

## Invariants

- Derive action availability from a small, explicit state model instead of scattering status checks across unrelated components.
- Keep backend status rules authoritative; frontend state may smooth UX but must not invent impossible transitions.
- Preserve documented non-regression behavior, such as quote share not regressing `viewed`, `approved`, or `declined`.
- Keep editability rules centralized in helpers such as `quoteStatus.ts` and `invoiceStatus.ts`.
- Disable sibling actions while an async mutation is in flight.
- Require confirmation for destructive or external side-effect actions.
- When a mutation returns partial data, preserve existing detail fields that the screen still needs.

## Canonical Matrix Shapes

Quote preview:

- `draft`
  - Primary action: generate PDF
  - Utility actions: email hidden, copy link hidden
  - Overflow actions: delete, mark as won, mark as lost
- `ready`
  - Primary action: open PDF if available, otherwise generate PDF
  - Utility actions: send by email, copy link
  - Overflow actions: delete, mark as won, mark as lost
- `shared`, `viewed`, `approved`, `declined`
  - Primary action: open PDF
  - Utility actions: resend email, copy link
  - Overflow actions: mark as won, mark as lost

Invoice detail:

- `draft`
  - Primary action: generate PDF
  - Utility actions: copy link
  - Email action: hidden
  - Edit action: available
- `ready`
  - Primary action: open PDF if available, otherwise generate PDF
  - Utility actions: send by email, copy link, optional source-quote back link
  - Edit action: available
- `sent`
  - Primary action: open PDF
  - Utility actions: resend by email, copy link, optional source-quote back link
  - Edit action: still available

## Allowed Deltas

- Local derived state is acceptable when it mirrors a server-backed transition already in flight or a temporary device-only artifact, such as a generated Blob URL.
- Button labels and layout can change if the action matrix and side effects remain intentional and covered by tests.
- New statuses are acceptable if backend rules, frontend helpers, docs, and tests are updated together.

## What Not To Assume

- Do not assume hidden and disabled are interchangeable; the quote and invoice flows intentionally use both.
- Do not assume all document types share the same editability or resend rules.
- Do not assume local UI state is enough for source of truth after a mutation; refetch or merge carefully.
- Do not assume a status change always implies the same side effects on every surface.

## Minimal Checklist

- Identify the authoritative statuses and any derived local action state.
- Write down visible actions per state before changing code.
- Verify async busy states disable conflicting actions.
- Verify confirmation dialogs still gate send, delete, or outcome mutations.
- Check partial-response merge behavior after state-changing actions.
- Update docs if externally visible action or error semantics changed.

## Verification Guidance

- `make frontend-verify`
- `make backend-verify` when frontend changes depend on backend status or side-effect rules
- For quote action parity, start with `frontend/src/features/quotes/tests/QuotePreview.test.tsx` and `frontend/src/features/quotes/tests/QuotePreviewActions.test.tsx`
- For invoice action parity, start with `frontend/src/features/invoices/tests/InvoiceDetailScreen.test.tsx`
- For backend status and side-effect parity, inspect `backend/app/features/quotes/service.py` and the send/outcome coverage in `backend/app/features/quotes/tests/test_quotes.py`
