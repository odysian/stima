## Summary
Implement Milestone 7 Optional Pricing Controls for quotes and invoices: optional discount (fixed or %), optional deposit, and optional simple tax, with conditional rendering across app UI, PDFs, and public document pages.

## Why
Contractors need lightweight real-world pricing flexibility (repeat-customer discounts, bundled-job adjustments, optional deposits, simple tax) without turning Stima into an accounting system or cluttering default flows.

## Problem Framing
- Goal: add optional tax/discount/deposit controls that are easy to use and invisible when unused.
- Non-goals: per-line tax, tax jurisdiction lookup/automation, payment tracking/collection, promo code workflows.
- Constraints:
  - Existing quote/invoice behavior must remain unchanged when optional fields are unset.
  - Optional controls must apply to both quotes and invoices (M5 dependency).
  - Keep existing UX simple by default (single-total view when no optional pricing is used).

## Proposed Implementation Plan
1. Add schema/model support for optional pricing fields on `documents` and `default_tax_rate` on `users`.
2. Wire backend contracts for create/update/read and quote-to-invoice inheritance; validate optional field combinations.
3. Add frontend pricing controls + settings default tax rate and introduce a shared pricing calculation utility.
4. Update app UI, PDF templates, and public document page to conditionally render subtotal/discount/tax/deposit/balance rows only when values exist.
5. Add targeted backend/frontend tests and update docs for contract/pattern changes.

## Risks and Edge Cases
- Rounding drift between frontend, backend-rendered templates, and public views.
- Ambiguity in pricing order (discount before tax vs tax before discount).
- Invalid combinations (`discount_type` without value, negative values, invalid ranges).
- Existing documents with null pricing fields must render exactly like pre-M7.
- Quote->invoice conversion must preserve optional pricing fields without regressions.
- Discount exceeding subtotal (negative totals/balance due) needs an explicit rule.

## Decision Locks (Before Implementation)
1. Calculation order lock: subtotal -> discount -> tax -> total -> balance due.
2. Optional rendering lock: unset pricing rows must be omitted entirely (no placeholders or labels).
3. Compatibility lock: existing docs without pricing fields remain unchanged in behavior/layout.
4. Rounding rule lock: compute all intermediate values in full precision; only stored and displayed amounts are rounded to 2 decimal places. Apply the same rounding rule across frontend (JS/TS), backend (Python), and PDF templates.
5. "Populated" definition lock: a pricing field is considered populated only when it is non-null AND non-zero. A zero-valued field is treated as unset for all rendering purposes.
6. Tax prefill lock: if `default_tax_rate` is set in Settings, new document forms:
   - show the default rate in a disabled "suggested tax" control,
   - keep the effective `tax_rate` field unset until the contractor explicitly toggles tax "on" for that document,
   - only write `documents.tax_rate` when tax is enabled and the user saves.
   No existing documents are affected.

## Schema (DB + API Contract Inputs)
Documents (`documents`) add:
- `tax_rate NUMERIC(5,4) NULL` - fractional convention: `0.0825 = 8.25%`. Valid stored range: `[0, 1]`.
- `discount_type VARCHAR(7) NULL` with CHECK in (`'fixed'`, `'percent'`) — canonical token is `"percent"` (not `"percentage"`); API types use `Literal["fixed", "percent"]`.
- `discount_value NUMERIC(10,2) NULL` (meaning depends on `discount_type`)
- `deposit_amount NUMERIC(10,2) NULL`

Users (`users`) add:
- `default_tax_rate NUMERIC(5,4) NULL` - fractional convention, same as `documents.tax_rate`.

Constraints/notes:
- All new columns are nullable; NULL is the only "unset" persistence value.
- Rendering uses the "populated" definition above (non-null AND non-zero).
- Migration adds the new columns with NULL defaults and no backfill; existing rows remain unaffected.
- Backend returns 422 for invalid combinations/ranges (see Acceptance Criteria); all 422 cases must be implemented as transactional checks with no partial writes.

## Acceptance Criteria
- [ ] Optional pricing fields persist correctly on quotes and invoices.
- [ ] Default tax rate is configurable in settings and prefilled for new documents.
- [ ] Conditional total breakdown renders only populated rows in app, PDF, and public pages.
- [ ] Empty pricing state preserves existing single-total layout.
- [ ] Quote-to-invoice conversion inherits pricing controls.
- [ ] Existing documents without pricing controls are unaffected.
- [ ] Backend returns 422 when:
  - `discount_type` is set without `discount_value` (or vice versa)
  - any numeric pricing field is negative
  - `tax_rate` is outside `[0, 1]` (fractional convention)
  - `discount_type = "percent"` and `discount_value` is outside \([0, 100]\)
  - discount exceeds subtotal (see rule below)
- [ ] Discount may not exceed the subtotal; backend returns 422 with a clear error message if it does.
- [ ] `make backend-verify` passes.
- [ ] `make frontend-verify` passes.

## Verification
```bash
make backend-verify
make frontend-verify
```

Manual checks:
1. Create quote with no pricing controls and verify single-total output everywhere.
2. Add discount + tax + deposit and verify conditional breakdown in app UI.
3. Generate/open PDF and verify matching conditional breakdown behavior.
4. Open public doc link and verify matching conditional breakdown behavior.
5. Convert priced quote to invoice and verify inherited pricing fields.
6. Remove each optional field and verify row omission in app/PDF/public views.
7. Cross-view parity: for the same document with discount + tax + deposit set, verify that subtotal, discount, tax, total, and balance-due values are numerically identical in app UI, generated PDF, and public landing page.
8. Invalid inputs: attempt to submit each of the following and verify 422 responses with no partial writes:
   - (a) `discount_type` without `discount_value`
   - (b) `discount_value` without `discount_type`
   - (c) negative `discount_value`
   - (d) negative `tax_rate`
   - (e) `tax_rate` outside `[0, 1]`
   - (f) `discount_type = "percent"` with `discount_value` > 100
   - (g) `discount_value` exceeding the sum of all line item prices

## Labels
- type:task
- area:quotes
- area:backend
- area:frontend

## Suggested Issue Command
```bash
gh issue create \
  --title "Task: Milestone 7 optional pricing controls end-to-end" \
  --label "type:task,area:quotes,area:backend,area:frontend" \
  --body-file plans/2026-03-29/task-m7-optional-pricing-controls.md
```
