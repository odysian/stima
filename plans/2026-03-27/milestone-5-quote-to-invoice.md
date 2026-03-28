# Plan: Milestone 5 — Quote to Invoice Conversion

**Date:** 2026-03-27
**Roadmap ref:** `docs/V1_ROADMAP.md` — Milestone 5
**Mode:** This is likely a `gated` candidate (multiple tasks) given scope. Flag for human decision.
**Depends on:** M1 (status expansion, `source_document_id`). M2 and M3 are dependencies for the fast follow, not for the initial ship.

---

## Scope Split

M5 ships in two cuts:

**First cut (this PR):** Core conversion + invoice PDF + copy-link sharing + document list integration. A contractor can convert an approved quote to an invoice, generate the PDF, copy the link, and share it manually — the same flow V0 quotes used before M2 and M3 existed.

**Fast follow (second PR):** Extend M2 and M3 infrastructure to invoices — invoice-specific public landing page rendering at `/doc/:token`, invoice email delivery with invoice-specific subject/template, and `invoice_viewed` event. This is not a separate milestone — it extends existing infrastructure to a new doc type.

---

## Goal

A contractor converts an approved quote to an invoice in one action — line items, total, and customer carry over automatically. The invoice has its own PDF and can be shared via copy-link.

---

## Non-Goals

- Payment processing or collection (V2+)
- Full invoice management (line item editing after conversion is allowed; full accounts receivable is not)
- Recurring invoices
- Partial invoicing (split a quote into multiple invoices)
- Invoice status beyond `draft → ready → sent` (no approve/decline lifecycle for invoices)
- Customer-facing action buttons on invoice landing page (read-only, same as quotes)
- Tax calculations or tax line items
- Invoice public landing page at `/doc/:token` (fast follow)
- Invoice email delivery (fast follow)
- `invoice_viewed` event (ships with the fast follow landing page extension)

---

## Current State Audit

### Document model
`backend/app/features/quotes/models.py` — `Document` model has `doc_type: String(20)` defaulting to `"quote"`. The field exists but only `"quote"` is used today.

### Doc numbering
`repository.py:282` — `doc_number` is formatted as `Q-{sequence:03d}`. The sequence counter (`doc_sequence`) is per-user. Invoice numbering needs a separate sequence or a shared sequence with different prefix.

### `source_document_id`
M1 adds this column (UUID FK, self-referential, `ON DELETE SET NULL`). M5 populates it at conversion time.

### Line items
`LineItem` model has `document_id` FK. Invoice line items are new rows with the invoice's `document_id`.

### Quote list
`QuoteList.tsx` and `repository.py:list_by_user` — currently returns all documents for the user. The query doesn't filter by `doc_type` because only quotes exist. M5 needs to decide how invoices appear in the UI.

### PDF template
`backend/app/templates/quote.html` — single template for all PDFs. Invoices need a variant with "Invoice" in the header and a due date field.

### Landing page
M2's `GET /api/public/doc/{share_token}` and `PublicQuotePage` frontend component. The roadmap says invoices reuse `/doc/:token` and render read-only.

### Email delivery
M3's `POST /api/quotes/{id}/send-email`. Invoice email needs the same flow but with invoice-specific subject and template.

### Share flow
`service.py:280-300` — `share_quote()` is quote-specific (references quote terminology). Invoice sharing follows the same pattern but may need its own method or a generalized version.

---

## Schema Changes

### 1. New `doc_sequence` behavior — invoice sequence

**Decision for human review:** Should quotes and invoices share the same per-user sequence counter, or have separate sequences?

- **Shared sequence:** `doc_sequence` increments for both quotes and invoices. `Q-001`, then `I-002`. Simpler, but numbering gaps appear within each type.
- **Separate sequences:** Quotes use one counter, invoices use another. `Q-001` and `I-001` can coexist. Requires a new column or a different sequencing approach.

**Recommendation:** Separate sequences. The roadmap specifies `I-001` format, implying invoices start at 001. Add an `invoice_sequence` column or change the sequencing to be `(user_id, doc_type)`-scoped.

**Implementation approach:** The current unique constraint is `(user_id, doc_sequence)`. Options:
- (a) Add a second sequence column `invoice_sequence` — messy, duplicates logic
- (b) Change unique constraint to `(user_id, doc_type, doc_sequence)` — each doc_type gets its own sequence space. This is cleaner.

**Recommendation:** Option (b). Migration changes the unique constraint and the sequence generation query.

### 2. New column: `due_date`

```sql
ALTER TABLE documents ADD COLUMN due_date DATE NULL;
```

Only meaningful for invoices. Nullable (quotes don't have due dates). Required before an invoice can be sent (enforced by service logic, not DB constraint).

### 3. Invoice status CHECK constraint

The current status values are `draft | ready | shared | viewed | approved | declined`. Invoices use `draft | ready | sent`.

**Decision for human review:** Should `sent` be a new status value added to the CHECK constraint, or should invoices reuse `shared`?

- **New `sent` value:** Semantic clarity — invoices are "sent", not "shared". But adds another status to the constraint.
- **Reuse `shared`:** Simpler schema, but the terminology is confusing ("shared invoice" vs "sent invoice").

**Recommendation:** Add `sent` to the CHECK constraint. The status label displayed in the UI can differ from the DB value, but keeping them aligned reduces confusion. The constraint becomes: `draft | ready | shared | viewed | approved | declined | sent`.

### Migration summary

One migration with:
1. `due_date DATE NULL` column on `documents`
2. `sent` added to status CHECK constraint (drop + recreate)
3. Unique constraint changed from `(user_id, doc_sequence)` to `(user_id, doc_type, doc_sequence)`

---

## Backend Changes

### 1. Model updates

- Add `DUE_DATE` column to `Document`: `due_date: Mapped[date | None]`
- Add `SENT = "sent"` to status enum (or equivalent string handling)
- Update `doc_number` formatting: `Q-{seq:03d}` for quotes, `I-{seq:03d}` for invoices

### 2. Repository: invoice creation

**New method: `create_invoice_from_quote(user_id, quote_id, due_date) -> Document`**

Logic:
1. Load source quote with line items
2. Generate next `doc_sequence` for `doc_type="invoice"` scoped to `(user_id, doc_type)`
3. Create new `Document` with:
   - `doc_type = "invoice"`
   - `customer_id = quote.customer_id`
   - `title = quote.title` (inherit)
   - `status = "draft"`
   - `source_document_id = quote.id`
   - `total_amount = quote.total_amount`
   - `notes = quote.notes`
   - `due_date = due_date`
   - `transcript = None` (invoices don't have transcripts)
   - `source_type = quote.source_type` (or null — not relevant for invoices)
4. Copy line items: create new `LineItem` rows with the invoice's `document_id`, preserving description, details, price, sort_order
5. Return the new invoice document

### 3. Repository: list updates

`list_by_user` needs to:
- Accept an optional `doc_type` filter (so the UI can show "all", "quotes only", or "invoices only")
- Return `doc_type` in the list item response so the UI can render type-specific badges

### 4. Repository: find invoice by source quote

**New method: `get_invoice_by_source(source_document_id) -> Document | None`**

Used on the quote detail screen to show "Invoice I-001 created from this quote" with a link.

### 5. Service: `convert_to_invoice()`

```python
async def convert_to_invoice(
    user: User,
    quote_id: UUID,
    due_date: date,
) -> Document:
```

Logic:
1. Load quote by `(quote_id, user_id)` — 404 if not found
2. If status is not `APPROVED` → 409 "Only approved quotes can be converted to invoices"
3. Check if an invoice already exists for this quote (`get_invoice_by_source`) → 409 "An invoice has already been created from this quote" (prevent duplicates)
4. Call `create_invoice_from_quote()`
5. Log `invoice_created` event with metadata `{ quote_id, invoice_id }`
6. Return the new invoice

### 6. Service: invoice PDF generation

The PDF integration needs to support both `quote.html` and a new `invoice.html` template. The render context is similar but includes `due_date` and uses "Invoice" header text.

**New template: `backend/app/templates/invoice.html`**

Based on `quote.html` but with:
- "Invoice" header instead of "Quote"
- Due date field in the metadata block
- `I-001` doc number format

**Decision for human review:** Should there be one PDF template with conditional sections, or two separate templates? **Recommendation:** Two templates. They're simple HTML files, and conditional branching in Jinja2 makes templates harder to read. The shared layout elements (logo, line items table, notes) can be Jinja2 includes/macros if duplication is a concern.

### 7. Service: invoice share (copy-link only in first cut)

The first cut supports sharing invoices via the existing copy-link flow — generating a
`share_token` and transitioning the invoice to `sent` status. This is the same mechanism
V0 quotes used before M2/M3 existed.

Options for implementation:
- (a) Generalize `share_quote()` to `share_document()` that dispatches on `doc_type`
- (b) Create a parallel `share_invoice()` method

**Recommendation:** Option (a) — generalize now. The logic is identical: create token,
transition status (`ready → sent` for invoices instead of `ready → shared`), log event.
This also prepares for the fast follow which adds email delivery for invoices.

### 8. API routes

**New routes:**

| Endpoint | Method | CSRF | Request | Response |
|---|---|---|---|---|
| `POST /api/quotes/{id}/convert` | POST | yes | `{ due_date: "YYYY-MM-DD" }` | `201 Invoice` |
| `GET /api/invoices/{id}` | GET | no | — | `200 InvoiceDetail` |
| `PATCH /api/invoices/{id}` | PATCH | yes | `{ line_items?, total_amount?, notes?, due_date?, title? }` | `200 Invoice` |
| `POST /api/invoices/{id}/pdf` | POST | yes | — | `200 PDF stream` |
| `POST /api/invoices/{id}/share` | POST | yes | — | `200 Invoice` |
| `POST /api/invoices/{id}/send-email` | POST | yes | — | `200 Invoice` (fast follow) |

**Decision for human review:** Should invoice routes live under `/api/invoices/` or `/api/quotes/`? The `documents` table stores both, but the API semantics are different. **Recommendation:** `/api/invoices/` for invoice-specific CRUD. The conversion trigger (`/api/quotes/{id}/convert`) stays under quotes because it's a quote action.

**Decision for human review:** Should invoices have their own `api.py` router file, or share the quotes router? **Recommendation:** New file `backend/app/features/quotes/invoice_api.py` (or a new `invoices` feature directory). The quotes router is already at 277 LOC. Adding 6+ routes would exceed budget. A separate router keeps things clean.

### 9. Public landing page — invoice support (FAST FOLLOW)

Deferred to fast follow PR. M2's `GET /api/public/doc/{share_token}` currently only
handles quotes. The fast follow extends it:

- After fetching the document by share_token, check `doc_type`
- If `"quote"` → existing quote rendering logic
- If `"invoice"` → return `PublicInvoiceResponse` (same as quote response + `due_date`)
- No `viewed` status transition for invoices — log `invoice_viewed` event only

In the first cut, shared invoices use the existing `/share/{share_token}` raw PDF endpoint
(the same flow V0 quotes used before M2 landed).

### 10. Event logging

Events added in M5 first cut:
- `invoice_created` — logged on conversion

Events added in fast follow:
- `invoice_viewed` — logged on public page load (already pre-registered by M6)

---

## Frontend Changes

### 1. Quote detail: "Convert to Invoice" button

On `QuotePreview.tsx` (or `QuotePreviewActions.tsx`), when status is `approved`:

Current: "Open PDF only"
New: "Open PDF" + **"Convert to Invoice"** (primary action, forest-gradient)

Clicking opens a modal with a date picker for the due date (defaulting to 30 days from today). On confirm, calls `POST /api/quotes/{id}/convert`.

On success, navigate to the new invoice detail screen.

### 2. Quote detail: linked invoice display

If the quote has a linked invoice (query via `source_document_id`), show a link:

```
Invoice I-001 created from this quote  [View →]
```

This requires an additional API call or embedding the linked invoice info in the quote detail response.

**Decision for human review:** Should `QuoteDetailResponse` include linked invoice info, or should the frontend make a second call? **Recommendation:** Add `linked_invoice: { id, doc_number, status } | null` to `QuoteDetailResponse`. One API call, no waterfall.

### 3. Invoice detail screen

New screen: `InvoicePreview.tsx` (or reuse `QuotePreview` with conditional rendering based on doc_type).

**Decision for human review:** Separate component vs. shared component? **Recommendation:** Separate. The action sets, terminology, and lifecycle differ enough that conditional branching in a shared component would be harder to maintain than two focused components.

**Route:** `/invoices/:id/preview`

**Layout:** Similar to quote preview but with:
- "Invoice I-001" header (instead of "Quote Q-001")
- Due date displayed prominently
- Status badges: `draft`, `ready`, `sent`
- Actions vary by status (same pattern as quotes but with invoice lifecycle)

### 4. Invoice in document list

The existing `QuoteList.tsx` shows all documents. M5 adds:
- Doc type indicator (small badge or icon distinguishing quotes from invoices)
- Filter tabs or segmented control: "All" / "Quotes" / "Invoices"

**Decision for human review:** Tabs/filter vs. mixed list? **Recommendation:** Mixed list with a doc type badge on each card. Filter tabs are V2 when the list gets long. For pilot with <50 documents, a mixed list is fine.

### 5. Invoice email template (FAST FOLLOW)

Deferred to fast follow. New email template for invoices with:
- "Invoice" in subject line: `"Invoice for {title}"` or `"Invoice {doc_number} from {business_name}"`
- Due date prominently displayed in email body
- CTA linking to `/doc/:token`

### 6. Public landing page — invoice variant (FAST FOLLOW)

Deferred to fast follow. `PublicQuotePage.tsx` handles both quotes and invoices by
branching on `doc_type` in the response. The layout is 90% identical — the differences
are header text ("Quote" vs "Invoice"), due date field, and status banner text.

The route stays `/doc/:token` — the backend response includes `doc_type` and the
frontend renders accordingly.

---

## Key Risks and Edge Cases

| Risk | Mitigation |
|---|---|
| Duplicate invoice creation from same quote | Service guard: check `get_invoice_by_source()` before creating. Return 409 if exists |
| Invoice line items diverge from quote after edit | Allowed — invoice is a separate document. Editing invoice line items doesn't affect the source quote |
| `doc_sequence` collision with new constraint | Same retry logic as quote creation (`create_quote` already retries on IntegrityError) |
| Invoice PDF template maintenance burden | Templates share structure but are separate files. Jinja2 macros or includes can reduce duplication if needed |
| Due date in the past | Allow it — the contractor may be invoicing for work already completed. No validation beyond "is a valid date" |
| Deleting source quote after invoice exists | `ON DELETE SET NULL` on `source_document_id`. Invoice survives; linkage is broken but invoice data is independent |
| `QuoteList` and `InvoicePreview` push frontend LOC budgets | Plan for extraction: invoice components can live in a `features/invoices/` directory |
| Invoice email reuses M3 flow but with different template | The email service should accept a template name parameter. Generalize in M3 or refactor in M5 |

---

## Implementation Order

### First cut (core conversion + PDF + copy-link)

1. Migration: `due_date` column, `sent` status, unique constraint change
2. Backend model: add `due_date`, `SENT` status, invoice `doc_number` formatting
3. Backend repository: `create_invoice_from_quote`, `get_invoice_by_source`, doc_type filter on list
4. Backend service: `convert_to_invoice()` with guards
5. Backend: invoice PDF template (`invoice.html`)
6. Backend: generalize share to support invoices (copy-link flow)
7. Backend API: conversion route + invoice CRUD routes (excluding `send-email`)
8. Backend tests: conversion flow, duplicate guard, invoice PDF, invoice share
9. Frontend: "Convert to Invoice" modal with date picker on approved quotes
10. Frontend: invoice detail screen (`InvoicePreview.tsx`)
11. Frontend: invoice actions (generate PDF, share/copy-link)
12. Frontend: doc type badge on list items
13. Frontend: linked invoice display on quote detail
14. Frontend tests: conversion modal, invoice detail, list badges
15. Update `docs/ARCHITECTURE.md`: invoice schema, endpoints, status lifecycle, events

### Fast follow (landing page + email delivery for invoices)

16. Backend: extend public endpoint to handle `doc_type="invoice"`
17. Backend: add `POST /api/invoices/{id}/send-email` route
18. Backend tests: public page invoice variant, invoice email
19. Frontend: extend public landing page for invoice doc_type
20. Frontend: invoice email template
21. Frontend tests: public page invoice variant, send email button
22. Update `docs/ARCHITECTURE.md`: public endpoint invoice support, invoice email endpoint

---

## Acceptance Criteria

### First cut

- [ ] "Convert to Invoice" action available on `approved` quotes only
- [ ] Conversion creates a new document with `doc_type="invoice"` and `source_document_id` set
- [ ] Invoice inherits line items, total, customer, title, and notes from source quote
- [ ] Invoice numbering is sequential per user in `I-001` format (separate from quote sequence)
- [ ] Due date is required before invoice can be sent (service guard, not DB constraint)
- [ ] Duplicate conversion from same quote returns 409
- [ ] Converting a quote does not change the quote's status or data
- [ ] Invoice PDF renders with "Invoice" header and due date
- [ ] Invoice can be shared via copy-link (same flow as V0 quote sharing)
- [ ] `invoice_created` event logged on conversion
- [ ] Quote detail screen shows linked invoice when one exists
- [ ] Document list shows both quotes and invoices with type differentiation
- [ ] Invoice status lifecycle: `draft → ready → sent` (no approve/decline)
- [ ] `docs/ARCHITECTURE.md` updated with invoice schema, endpoints, and status lifecycle

### Fast follow

- [ ] Invoice landing page renders at `/doc/:token` with invoice-specific content
- [ ] Invoice can be emailed using the same flow as quotes (invoice-specific subject/template)
- [ ] `invoice_viewed` event logged on public page load

---

## Verification

```bash
make backend-verify
make frontend-verify
```

Manual (first cut):
1. Approve a quote → press "Convert to Invoice" → set due date → confirm invoice created
2. Check invoice detail → confirm line items, total, customer, title match source quote
3. Check source quote detail → confirm linked invoice reference with "View" link
4. Generate invoice PDF → confirm "Invoice" header and due date present
5. Share invoice via copy-link → confirm share token generated, link works for PDF download
6. Try converting the same quote again → confirm 409 error
7. Check document list → confirm both quote and invoice appear with type badges
8. Check `event_logs` → confirm `invoice_created` event

Manual (fast follow):
9. Open invoice landing page via `/doc/:token` → confirm renders with "Invoice" header and due date
10. Send invoice by email → confirm email arrives with invoice subject
11. Check `event_logs` → confirm `invoice_viewed` event on page load
