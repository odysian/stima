## Summary
Complete Milestone 8 by bringing invoice editing up to the locked parity contract and landing the
roadmap/doc updates that describe the contractor-first baseline.

## Why
M8 shipped the new builder handoff, direct invoice creation, and invoice discoverability, but the
invoice edit path is still due-date-only. The spec explicitly locked invoice editing to the full
document fields, so this follow-up closes the remaining contract gap instead of leaving M8 only
partially complete.

## Problem Framing
- Goal: make invoice editing match the locked M8 contract for both direct and quote-derived
  invoices, then land the pending roadmap update in the same task.
- Non-goals: invoice public landing pages, invoice payments/AR workflows, archive/delete policy
  changes, customer-facing immutable history, or a broader invoice IA redesign.
- Constraints:
  - `PATCH /api/invoices/{id}` remains the single invoice edit endpoint.
  - The edit contract must support `title`, `line_items`, `total_amount`, `notes`, and `due_date`.
  - The contract must work for `draft`, `ready`, and `sent` invoices.
  - Editing a `ready` invoice must preserve `ready`.
  - Editing a `sent` invoice must preserve `sent`, `share_token`, and `shared_at`.
  - Direct invoices (`source_document_id = null`) and quote-derived invoices must use the same edit
    contract.
  - Customer-facing/shared invoice PDFs must render the latest persisted content after edits.
  - This task should land the pending `docs/V1_ROADMAP.md` Milestone 8 update.
  - `customer_id` filtering is already part of the list contract; this task does not add a new
    customer-detail invoice history UI unless an existing caller needs patching to use the contract.

## Proposed Implementation Plan
1. Expand backend invoice patch schemas, service logic, and repository updates to accept the full
   locked edit payload for `draft`, `ready`, and `sent`.
2. Preserve status/share-token continuity rules while updating invoice fields in place for both
   direct and quote-derived invoices.
3. Extend the frontend invoice detail/edit flow so contractors can edit invoice content beyond due
   date only.
4. Add backend/frontend tests covering direct and quote-derived invoice edits, including sent-invoice
   parity and latest-content rendering expectations.
5. Land the pending `docs/V1_ROADMAP.md` update and refresh `docs/ARCHITECTURE.md` if the final
   patch contract or UI flow details change.

## Decision Locks (Before Implementation)
1. This task closes an existing M8 contract gap; it does not reopen the broader milestone design.
2. `PATCH /api/invoices/{id}` stays the only invoice edit endpoint.
3. Quote edit behavior is unchanged in this task.
4. The follow-up does not add a separate invoice dashboard or customer-hub invoice management flow.
5. Public invoice access remains the existing shared PDF path; no `/doc/:token` invoice landing page.

## Acceptance Criteria
- [ ] `PATCH /api/invoices/{id}` accepts `title`, `line_items`, `total_amount`, `notes`, and
      `due_date`.
- [ ] The expanded patch contract works for both direct invoices and quote-derived invoices.
- [ ] `draft` invoices remain editable through the single invoice patch contract.
- [ ] Editing a `ready` invoice keeps it in `ready`.
- [ ] Editing a `sent` invoice keeps it in `sent`.
- [ ] Editing a `sent` invoice does not rotate `share_token` or clear `shared_at`.
- [ ] Shared invoice PDFs render the latest persisted content after invoice edits.
- [ ] Frontend invoice editing is no longer due-date-only.
- [ ] Frontend edit behavior is explicit for both direct invoices and quote-derived invoices.
- [ ] Existing quote behavior and quote -> invoice conversion semantics remain unchanged.
- [ ] `docs/V1_ROADMAP.md` lands with the M8 contractor-first milestone update.
- [ ] `docs/ARCHITECTURE.md` is updated if the invoice patch contract/UI flow changes materially.
- [ ] `make backend-verify` passes.
- [ ] `make frontend-verify` passes.

## Verification
```bash
make backend-verify
make frontend-verify
```

Manual checks:
1. Create a direct invoice, edit title/line items/total/notes/due date, and confirm the changes
   persist.
2. Generate a PDF for a `draft` invoice so it becomes `ready`, edit it, and confirm it stays `ready`.
3. Share an invoice so it becomes `sent`, edit it, and confirm it stays `sent` with the same
   `share_token`.
4. Re-open the shared invoice PDF after edits and confirm it shows the latest content.
5. Create an invoice from an approved quote, edit it, and confirm source-quote fields still behave
   correctly.
6. Confirm quote preview, quote editing, and quote -> invoice conversion still behave as before.
7. Confirm the roadmap reflects M8 in the build order and contractor-first baseline language.

## Labels
- type:task
- area:quotes
- area:frontend
- area:backend

## Suggested Issue Command
```bash
gh issue create \
  --title "Task: Milestone 8 invoice edit parity and roadmap closeout" \
  --label "type:task,area:quotes,area:frontend,area:backend" \
  --body-file plans/2026-03-31/task-m8-invoice-edit-parity-and-roadmap-closeout.md
```
