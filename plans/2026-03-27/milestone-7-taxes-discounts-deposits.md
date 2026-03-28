# Plan: Milestone 7 — Taxes, Discounts, and Deposits

**Date:** 2026-03-27
**Roadmap ref:** `docs/V1_ROADMAP.md` — Milestone 7
**Mode:** single (one task, one PR)
**Depends on:** M5 (invoices must exist so taxes/discounts apply to both doc types)
**Pulled from:** `docs/V2_ROADMAP.md` Track 1 — moved into V1 Phase 3 because a paid tier
requires invoices that handle sales tax.

---

## Goal

Quotes and invoices support sales tax, a discount line, and a deposit line — the minimum
pricing controls a contractor needs before Stima can justify a paid tier.

---

## Non-Goals

- Per-line-item tax rates
- Tax jurisdiction lookup or automatic tax calculation
- Deposit payment tracking or payment status
- Discount codes or promotional pricing
- Payment processing (Stima is display-only for all financial fields)
- Recurring tax/discount presets per customer

---

## Current State Audit

### Document model
`backend/app/features/quotes/models.py` — `Document` has `total_amount: Numeric(10,2), nullable`. This is a single flat total today. No tax, discount, or deposit columns exist.

### PDF template
`backend/app/templates/quote.html` — total section renders a single total row. After M5, `invoice.html` will exist with its own total section. Both templates need conditional rendering for the new fields.

**Critical dependency:** The V2 roadmap explicitly notes that the PDF total section must be implemented as a conditional block, not a hardcoded single-line total. If M5 builds a hardcoded total block, M7 must restructure the template. This risk should be flagged during M5 implementation review.

### Landing page
After M2 (and M5 fast follow for invoices), the public landing page renders total amount. M7 extends the total section on the landing page to match PDF rendering.

### Settings / profile
`backend/app/features/profile/` — user profile with business_name, trade_type, timezone, logo. No tax rate or pricing default fields exist today.

### Quote creation flow
`backend/app/features/quotes/schemas.py` — `QuoteCreateRequest` includes `total_amount`. The review screen calculates total from line item prices client-side. M7 adds optional tax/discount/deposit that modify the final total.

---

## Schema Changes

### 1. New columns on `documents`

```sql
ALTER TABLE documents
  ADD COLUMN tax_rate NUMERIC(5,2) NULL,
  ADD COLUMN discount_type VARCHAR(10) NULL,
  ADD COLUMN discount_value NUMERIC(10,2) NULL,
  ADD COLUMN deposit_amount NUMERIC(10,2) NULL;
```

| Column | Type | Notes |
|---|---|---|
| `tax_rate` | Numeric(5,2) | nullable, percentage (e.g. `8.25` = 8.25%). NULL = no tax |
| `discount_type` | String(10) | nullable, `"fixed"` or `"percentage"`. NULL = no discount |
| `discount_value` | Numeric(10,2) | nullable, the discount amount or percentage. NULL = no discount |
| `deposit_amount` | Numeric(10,2) | nullable, fixed dollar amount. NULL = no deposit |

**Design note:** `total_amount` remains the user-editable grand total. The backend does not auto-calculate totals from subtotal + tax - discount. The frontend computes the breakdown for display and sends the final `total_amount` on save. This keeps the backend simple and avoids rounding disputes.

**Decision for human review:** Should the backend compute and validate the total from components, or trust the frontend-computed total? **Recommendation:** Trust the frontend total. The contractor may want to round or adjust. Validation complexity (floating-point rounding across tax + discount + deposit) is not worth the guardrail value at pilot scale.

### 2. New column on `users` (default tax rate)

```sql
ALTER TABLE users ADD COLUMN default_tax_rate NUMERIC(5,2) NULL;
```

The user sets this once in Settings. New quotes pre-fill with this rate. Individual quotes can override or disable.

### Migration summary

One migration:
1. `tax_rate`, `discount_type`, `discount_value`, `deposit_amount` on `documents`
2. `default_tax_rate` on `users`

---

## Backend Changes

### 1. Model updates

Add to `Document`:
```python
tax_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
discount_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
discount_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
deposit_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
```

Add to `User`:
```python
default_tax_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
```

### 2. Schema updates

**QuoteCreateRequest / QuoteUpdateRequest:** Add optional fields:
- `tax_rate: Decimal | None`
- `discount_type: Literal["fixed", "percentage"] | None`
- `discount_value: Decimal | None`
- `deposit_amount: Decimal | None`

Validation:
- If `discount_type` is set, `discount_value` must also be set (and vice versa)
- `tax_rate` must be >= 0 and <= 100 if set
- `discount_value` must be >= 0 if set
- `deposit_amount` must be >= 0 if set

**QuoteDetailResponse / QuoteListItem:** Add the same fields to responses.

### 3. Service updates

**`create_quote()`:** Accept new fields and pass through to repository.

**`update_quote()`:** Accept new fields in partial update.

**`convert_to_invoice()`:** Inherit `tax_rate`, `discount_type`, `discount_value`, and `deposit_amount` from source quote when creating the invoice.

### 4. Profile: default tax rate

**`PATCH /api/profile`:** Accept `default_tax_rate` in the update payload.
**`GET /api/profile`:** Return `default_tax_rate` in the response.

### 5. PDF template updates

Both `quote.html` and `invoice.html` need conditional total section rendering:

```jinja2
<tr class="subtotal-line">
  <td>Subtotal</td>
  <td>{{ subtotal }}</td>
</tr>
{% if discount_value %}
<tr class="discount-line">
  <td>Discount ({{ discount_display }})</td>
  <td>-{{ discount_amount }}</td>
</tr>
{% endif %}
{% if tax_rate %}
<tr class="tax-line">
  <td>Tax ({{ tax_rate }}%)</td>
  <td>{{ tax_amount }}</td>
</tr>
{% endif %}
<tr class="total-line">
  <td>Total</td>
  <td>{{ total_amount }}</td>
</tr>
{% if deposit_amount %}
<tr class="deposit-line">
  <td>Deposit Required</td>
  <td>{{ deposit_amount }}</td>
</tr>
<tr class="balance-line">
  <td>Balance Due</td>
  <td>{{ balance_due }}</td>
</tr>
{% endif %}
```

**Render context additions:** The `QuoteRenderContext` needs computed display values:
- `subtotal`: sum of line item prices (the pre-tax, pre-discount total)
- `discount_display`: "10%" or "$50" depending on type
- `discount_amount`: computed dollar amount of discount
- `tax_amount`: computed tax on (subtotal - discount)
- `balance_due`: total - deposit (if deposit exists)

These are computed at render time from the stored fields. They are not persisted.

### 6. Public endpoint updates

`GET /api/public/doc/{share_token}` response needs the new fields so the landing page
total section can render conditionally.

Add to `PublicQuoteResponse`:
- `tax_rate`, `discount_type`, `discount_value`, `deposit_amount`
- Computed: `subtotal`, `tax_amount`, `discount_amount`, `balance_due`

---

## Frontend Changes

### 1. Settings: default tax rate

Add a "Default Tax Rate" field to the Settings screen. Simple percentage input with
a "%" suffix. Saves via `PATCH /api/profile`.

### 2. Quote review/edit screen: pricing controls

Add an optional "Pricing" section below the line items list on the review and edit
screens. Collapsed by default if no values are set. Expands to show:

- **Tax rate** — percentage input, pre-filled from user's default. Toggle to disable.
- **Discount** — type selector ($ or %) + value input. Optional.
- **Deposit** — dollar amount input. Optional.

### 3. Total section display

Replace the current single-line total display with a conditional breakdown:

```
Subtotal                    $1,200.00
Discount (10%)               -$120.00
Tax (8.25%)                    $89.10
─────────────────────────────────────
Total                       $1,169.10
Deposit Required              $500.00
Balance Due                   $669.10
```

Only populated rows render. If no tax, discount, or deposit, the display is identical
to today (just "Total: $X").

This breakdown appears on:
- Quote preview / detail screen
- Invoice preview / detail screen
- PDF (via template)
- Public landing page

### 4. Total calculation

Client-side calculation order:
1. `subtotal` = sum of line item prices (null prices treated as $0 for math)
2. `discount_amount` = fixed value or (subtotal * percentage / 100)
3. `taxable_amount` = subtotal - discount_amount
4. `tax_amount` = taxable_amount * tax_rate / 100
5. `total` = taxable_amount + tax_amount
6. `balance_due` = total - deposit_amount

The frontend computes this live as the user edits. The final `total_amount` sent to
the backend is the computed total.

**Decision for human review:** Should `formatCurrency` handle the new computed fields,
or should a dedicated `calculateQuoteTotal()` utility exist? **Recommendation:** New
utility in `@/shared/lib/pricing.ts`. The calculation logic is reused across quote
review, quote edit, invoice detail, and landing page. A single source of truth
prevents drift.

### 5. Landing page total section

Extend the `PublicQuotePage` total display with the same conditional breakdown.
Uses the computed fields from the API response (backend computes them for the
public endpoint so the landing page doesn't need the calculation utility).

### 6. Invoice conversion inheritance

When the "Convert to Invoice" flow runs, the new invoice inherits tax_rate,
discount_type, discount_value, and deposit_amount from the source quote. The
contractor can edit them on the invoice before sending.

---

## Key Risks and Edge Cases

| Risk | Mitigation |
|---|---|
| Rounding errors between frontend and PDF | Both use the same calculation order. Frontend rounds to 2 decimal places at each step. Backend render context uses the same logic |
| Tax on discounted vs. pre-discount amount | Document the order: tax applies after discount. This matches standard practice |
| Existing quotes with null tax/discount/deposit | Display is identical to today — conditional rendering means no visual change |
| `total_amount` diverges from calculated breakdown | Accepted trade-off — contractor controls the final number. No server-side validation of the math |
| Settings default tax rate propagates to existing drafts | It only pre-fills new quotes. Existing drafts are unchanged |
| Discount percentage > 100% | Allow it — the contractor might be crediting a customer. Validate >= 0 only |
| PDF template restructure if M5 hardcodes total | Flag during M5 review: total section must be conditional-ready |

---

## Implementation Order

1. Migration: new columns on `documents` and `users`
2. Backend model: add fields to `Document` and `User`
3. Backend schemas: add fields to create/update request and response schemas
4. Backend service: pass new fields through create/update/convert flows
5. Backend profile: add `default_tax_rate` to profile PATCH/GET
6. Backend PDF: update render context with computed values, update templates
7. Backend public endpoint: add new fields + computed values to response
8. Backend tests: create/update with tax/discount/deposit, PDF rendering, conversion inheritance
9. Frontend: `pricing.ts` calculation utility
10. Frontend: Settings default tax rate field
11. Frontend: pricing controls on review/edit screen
12. Frontend: conditional total breakdown display on preview/detail screens
13. Frontend: landing page total section update
14. Frontend tests: calculation utility, pricing controls, total display, landing page
15. Update `docs/ARCHITECTURE.md`: new columns, updated schemas

---

## Acceptance Criteria

- [ ] Contractor can set a default tax rate in Settings
- [ ] New quotes pre-fill tax rate from user's default; can be overridden or disabled
- [ ] Discount (fixed dollar or percentage) can be added per quote/invoice
- [ ] Deposit amount can be specified per quote/invoice
- [ ] Total section on quote/invoice detail shows conditional breakdown (subtotal, discount, tax, total, deposit, balance due)
- [ ] Only populated fields render — no empty rows for unused pricing controls
- [ ] PDF total section renders the same conditional breakdown
- [ ] Landing page total section matches PDF rendering
- [ ] Invoice conversion inherits tax/discount/deposit from source quote
- [ ] Existing quotes/invoices without tax/discount/deposit display and function unchanged
- [ ] All three fields are optional — no gate on existing workflows
- [ ] `docs/ARCHITECTURE.md` updated with new columns and schema fields

---

## Verification

```bash
make backend-verify
make frontend-verify
```

Manual:
1. Set default tax rate to 8.25% in Settings → create a quote → confirm tax pre-filled
2. Add a 10% discount and $500 deposit → confirm total breakdown renders correctly
3. Generate PDF → confirm total section matches the UI breakdown
4. Open landing page → confirm total section matches PDF
5. Convert quote to invoice → confirm tax/discount/deposit inherited
6. Edit invoice to remove tax → confirm total section updates (no tax row)
7. Create a quote with no tax/discount/deposit → confirm display is identical to pre-M7 behavior
8. Verify PDF for quote with no pricing controls → confirm single total line only
