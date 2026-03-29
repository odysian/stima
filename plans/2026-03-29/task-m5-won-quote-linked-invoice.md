## Summary
Milestone 5 keeps invoices in V1 but treats them as downstream child documents of quotes,
not peer records in the main list. A contractor converts a won quote (`approved`) into a
linked invoice with minimal extra input, then shares/sends it using existing document
patterns.

Plan references:
- `docs/V1_ROADMAP.md` — Milestone 5
- `plans/2026-03-27/milestone-5-quote-to-invoice.md`

---
## Goal
- Deliver quote-first invoice conversion without creating a separate invoice management layer.
- Keep main list clean: quote-focused by default, no quote+invoice duplicate rows for one job.
- Support first-cut conversion/share flow now, with landing-page/email extension as fast follow.

---
## Non-Goals
- Invoice dashboards or standalone invoice management subsystem.
- AR workflows: overdue collections, payment tracking, payment processing, bookkeeping.
- Extra invoice lifecycle states beyond `draft -> ready -> sent`.
- Invoice `viewed` state (invoices remain `sent` when viewed publicly).
- Customer-side action buttons on invoice public pages.

---
## Constraints / Contracts
- Conversion trigger is quote detail only: won (`approved`) quotes expose "Convert to Invoice".
- Invoice is a child document linked by `source_document_id`.
- Quote detail shows compact linked invoice summary, not full invoice inline.
- Invoice detail is dedicated and includes source-quote back-link.
- Main quote list is quote-only by default (`doc_type='quote'` filter in primary listing path).
- First cut invoice copy-link targets `/share/:token` (raw PDF route).
- Fast follow extends public/email invoice delivery to `/doc/:token` + invoice email flow.
- `sent` is invoice-only in transitions; quote transitions must never use `sent`.
- Sent invoices are read-only (`PATCH /api/invoices/{id}` returns 409 when sent).

Required API response contracts:
- `QuoteDetailResponse.linked_invoice`:
  `{ id, doc_number, status, due_date, total_amount, created_at } | null`
- `GET /api/invoices/{id}` (`InvoiceDetail`) includes:
  - `id`
  - `doc_number`
  - `status`
  - `due_date`
  - `total_amount`
  - `created_at`
  - `source_document_id`
  - `source_quote_number`
  - `line_items`
  - `customer`

Required DB invariant:
- Add unique index on `source_document_id` where `doc_type='invoice'` to prevent
  duplicate invoice conversion under concurrency.

---
## Scope
### First cut
### Backend
- Add/complete quote->invoice conversion path with inheritance:
  customer, title/context, line items, totals.
- Generate invoice number in `I-001` format.
- Ensure invoice lifecycle and share behavior:
  - conversion creates invoice in `draft`
  - share auto-advances `draft -> ready -> sent`
  - sent invoice becomes read-only
- Keep list behavior quote-first in main list query path.
- Enforce duplicate conversion guard at DB level and service layer.
- Ensure source link is visible both ways (`source_document_id` + source quote refs).

### Frontend
- Quote detail:
  - no invoice -> show invoice card with "Convert to Invoice"
  - has invoice -> show compact summary card with link
- Invoice detail page:
  - quote-detail-like structure
  - invoice metadata (number, due date, total, status)
  - clear "Created from Quote ..." navigation back-link
- Keep primary quote list quote-focused; invoices should not appear as peer rows.
- First-cut copy-link wiring for invoices uses `/share/:token`.

### Docs
- Update `docs/ARCHITECTURE.md` as a pre-merge deliverable with:
  schema notes, transition rules, route contracts, and response shapes.

### Fast follow
- Extend `/doc/:token` public document handling for invoice rendering (read-only).
- Add invoice email delivery path reusing Milestone 3 infrastructure.
- Log `invoice_viewed` on invoice public page load (no invoice status transition).

---
## Acceptance Criteria
### First cut
- [ ] "Convert to Invoice" appears only for won (`approved`) quotes.
- [ ] Conversion creates `doc_type='invoice'` with `source_document_id` set.
- [ ] Invoice inherits customer, title/context, line items, and totals from source quote.
- [ ] Invoice number is sequential per user in `I-001` format.
- [ ] Due date is prefilled and editable with low friction.
- [ ] Quote detail is the primary invoice create/access surface.
- [ ] Quote detail shows compact linked invoice summary (number/status/due/total/created),
      never full invoice inline.
- [ ] Invoice has dedicated detail page and clearly links back to source quote.
- [ ] Main quote list remains quote-focused; no invoice peer rows for converted jobs.
- [ ] Invoice copy-link in first cut points to `/share/:token`.
- [ ] Sent invoices are read-only (`PATCH /api/invoices/{id}` returns 409 when sent).
- [ ] Invoice share flow auto-advances `draft -> ready -> sent`.
- [ ] Duplicate conversion is prevented by service guard and required DB unique index on
      invoice source link.
- [ ] `docs/ARCHITECTURE.md` is updated pre-merge with route and response contracts.

### Fast follow
- [ ] Public invoice page renders at `/doc/:token` using existing document-view pattern.
- [ ] Invoice email delivery reuses Milestone 3 delivery model.
- [ ] Invoice public view logs `invoice_viewed` without invoice status transition.

---
## Verification
Automated:
```bash
make backend-verify
make frontend-verify
```

Manual (first cut):
1. Mark quote Won (`approved`) and convert to invoice.
2. Confirm inherited data and generated invoice number.
3. Confirm quote detail shows compact linked invoice summary.
4. Confirm invoice detail shows source quote back-link.
5. Share invoice and confirm share link is `/share/:token`.
6. Attempt editing sent invoice and confirm 409/read-only behavior.
7. Attempt concurrent duplicate conversion and confirm single invoice result.
8. Confirm main quote list does not show invoice as peer row.

Manual (fast follow):
9. Open invoice `/doc/:token` page and confirm read-only render.
10. Send invoice email and verify template/links.
11. Confirm `invoice_viewed` logging and no invoice status transition.

---
## Dependencies
- Milestone 1: `approved` outcome and `source_document_id` foundation.
- Milestone 2 + 3 are required for fast follow only.

