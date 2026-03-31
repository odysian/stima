## Summary
Add customer-scoped invoice filtering parity on contractor surfaces that already support
customer-scoped quote history, so the invoice list contract is usable in practice and not only
available as a backend capability.

## Why
Milestone 8 locked `customer_id` filtering into the invoice list contract, and the backend plus
frontend service support it today. But the app still exposes customer-scoped history only for
quotes, which means invoices do not yet benefit from that parity on the customer detail flow.

## Problem Framing
- Goal: expose customer-scoped invoice filtering on the appropriate contractor UI surface without
  expanding M8 into a broader invoice-management subsystem.
- Non-goals: account-wide invoice IA redesign, invoice payments/AR workflows, invoice public
  landing pages, or changes to invoice edit/share semantics.
- Constraints:
  - Scope this work to the existing customer detail screen.
  - Reuse the existing `GET /api/invoices?customer_id=<id>` contract.
  - Preserve the current quote-scoped customer history behavior.
  - Keep the UI lightweight and customer-contextual rather than adding a new standalone invoice hub.
  - Add invoice history within the existing customer history area using a lightweight quote/invoice
    switcher rather than inventing a new customer-context surface.
  - Direct invoices and quote-derived invoices must both appear correctly when filtered to one
    customer.
  - Empty/loading/error states should be explicit, not implied.

## Proposed Implementation Plan
1. Identify the existing customer-scoped quote-history surface that should gain invoice parity.
2. Reuse `invoiceService.listInvoices({ customer_id })` rather than introducing a new transport
   shape.
3. Add the smallest UI needed to expose invoice history in customer context, keeping quote and
   invoice concerns readable through a simple history toggle.
4. Add backend/frontend tests covering customer-filtered invoice data, including direct and
   quote-derived invoices.
5. Update docs only if the customer-detail/history contract or UX expectations materially change.

## Decision Locks (Before Implementation)
1. This is a follow-up parity task, not a reopening of Milestone 8 discoverability scope.
2. Customer-scoped invoice filtering uses the existing list endpoint; no new endpoint is added.
3. The task does not add a global invoice dashboard, new nav destination, or invoice public page.
4. Direct invoices and quote-derived invoices must remain visually distinguishable only if existing
   UI patterns already support that cleanly; otherwise keep the first pass simple.

## Acceptance Criteria
- [ ] A contractor can view invoices filtered to a single customer on the intended customer-scoped
      surface.
- [ ] The intended surface is the existing customer detail screen.
- [ ] The customer detail screen exposes a lightweight history switcher so contractors can toggle
      between customer-scoped quotes and invoices on the same surface.
- [ ] The feature uses existing `GET /api/invoices?customer_id=<id>` filtering rather than a new
      backend contract.
- [ ] Both direct invoices and quote-derived invoices appear when they belong to the selected
      customer.
- [ ] Quotes remain available on the same customer-scoped surface without regression when switching
      history modes.
- [ ] Empty, loading, and error states are explicit for customer-scoped invoice history when the
      invoice history mode is active.
- [ ] No new standalone invoice dashboard or navigation surface is introduced.
- [ ] `make backend-verify` passes if backend tests change.
- [ ] `make frontend-verify` passes.

## Verification
```bash
make frontend-verify
```

Add `make backend-verify` if backend tests or endpoint behavior change.

Manual checks:
1. Open a customer with at least one direct invoice and confirm the invoice history is visible in
   that customer context.
2. Confirm quote-derived invoices also appear when they belong to the same customer.
3. Open a customer with no invoices and confirm the empty state is intentional.
4. Confirm quote history behavior on the same screen still works as before.

## Labels
- type:task
- area:quotes
- area:frontend
- area:backend

## Suggested Issue Command
```bash
gh issue create \
  --title "Task: Milestone 8 customer-scoped invoice filtering parity" \
  --label "type:task,area:quotes,area:frontend,area:backend" \
  --body-file plans/2026-03-31/task-m8-customer-scoped-invoice-filtering-parity.md
```
