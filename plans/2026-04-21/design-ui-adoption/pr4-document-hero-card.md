# PR4 — Document Hero Card Redesign

## Status

**Planning — ready to scope as a Task.** Follow-up to PR3 (Quote Preview UI adoption, PR #491). Redesigns the hero information card on both `/quotes/:id/preview` and `/invoices/:id` into a single consistent `DocumentHeroCard` component.

---

## Motivation

After PR3 landed the design refresh on Quote Preview, the Invoice Detail screen was also updated for consistency. Both screens currently use `QuoteDetailsCard` (client + document type + total) as the hero, with a separate card below it for invoice-specific metadata (status, source, due date). In conversation review this was identified as:

- Two cards where one would read better
- Redundant `StatusPill` in the header (proposed: move to hero card, clean up header)
- `LinkedInvoiceCard` on Quote Preview using a different interaction pattern than "Open Quote →" on Invoice Detail
- Header titles using dynamic document data (customer name / title) rather than a stable screen label

---

## Proposed Design

### Hero Card — two-column layout

One card replaces `QuoteDetailsCard` + the Invoice Status / Linked Invoice card.

**Left column**

| Slot | Quote Preview | Invoice Detail |
|------|--------------|----------------|
| Eyebrow | `CLIENT` | `CLIENT` |
| Primary | client name (bold) | client name (bold) |
| Secondary | client contact (sm, variant) | client contact (sm, variant) |
| *(conditional)* | `LINKED INVOICE` eyebrow + `Open Invoice →` button (if linked invoice exists) | `INVOICE STATUS` eyebrow + `Created on [date]` (sm, variant) + `Open Quote →` button (if source quote exists) |

**Right column**

| Slot | Quote Preview | Invoice Detail |
|------|--------------|----------------|
| Document stamp | `QUOTE` (font-headline, large) | `INVOICE` (font-headline, large) |
| Eyebrow | `TOTAL AMOUNT` | `TOTAL AMOUNT` |
| Amount | total value (font-headline, primary green) | total value (font-headline, primary green) |
| *(conditional)* | — | `DUE DATE` eyebrow + date value (sm) |
| Pill | `StatusPill` | `StatusPill` |

**Pricing breakdown** (tax / discount / deposit) renders below the two-column grid, inside the same card, when those fields are set — identical to current `QuoteDetailsCard` behaviour.

### "Open Quote →" / "Open Invoice →" buttons

Both use the same inline button style: `text-sm font-semibold text-primary` + `arrow_forward` icon. Currently the Quote Preview uses a dedicated `LinkedInvoiceCard` component; after this change both screens use the same inline link inside the hero card.

### Header changes (both screens)

| | Before | After |
|---|---|---|
| `title` | dynamic (customer name / doc title / fallback) | `"Quote Preview"` or `"Invoice Preview"` (fixed) |
| `subtitle` | doc number when title/customer present | `"Q-001"` or `"Q-001 · Spring Cleanup"` (number + optional title, `·` separator) |
| Trailing | StatusPill + edit + overflow | edit + overflow only (pill moves to hero card) |

---

## Scope

### In

- `frontend/src/ui/DocumentHeroCard.tsx` — new shared primitive (replaces `QuoteDetailsCard` at both call-sites)
- `frontend/src/features/quotes/components/QuotePreview.tsx` — header convention + swap to `DocumentHeroCard`
- `frontend/src/features/invoices/components/InvoiceDetailScreen.tsx` — header convention + swap to `DocumentHeroCard`
- `frontend/src/features/quotes/components/QuoteDetailsCard.tsx` — **delete** (no remaining call-sites after migration)
- `frontend/src/features/quotes/components/LinkedInvoiceCard.tsx` — **delete** (folded into `DocumentHeroCard`)
- `frontend/src/features/quotes/components/QuotePreviewHeaderActions.tsx` — remove `StatusPill`; keep edit + overflow

### Out

- Review / Edit, Capture, Quote List
- New API calls or data fields (due date already exists on `InvoiceDetail`)
- Copy changes to action buttons, overflow labels, dialogs
- Pricing / tax / discount logic (carry over unchanged from `QuoteDetailsCard`)

---

## Copy decisions locked in planning

- Invoice Status line: `Created on [date]` — no "from Quote Q-001" prefix, regardless of source. Source quote link renders separately below.
- Header title strings: `"Quote Preview"` and `"Invoice Preview"` (literal, not dynamic).
- Subtitle format: `"I-002"` or `"I-002 · Spring Cleanup"` when title exists.

---

## Acceptance criteria

- [ ] Both screens show the unified two-column hero card with client info, document type, total, and status pill
- [ ] StatusPill removed from both screen headers; header shows edit + overflow only
- [ ] Header title is `"Quote Preview"` / `"Invoice Preview"`; subtitle is `doc_number` or `doc_number · title`
- [ ] "Open Invoice →" on Quote Preview and "Open Quote →" on Invoice Detail use identical button style
- [ ] Pricing breakdown (tax / discount / deposit) still renders correctly when fields are set
- [ ] `requiresCustomerAssignment` redirect on Quote Preview unchanged
- [ ] All existing test assertions pass or are updated for intentional DOM changes
- [ ] `make frontend-verify` passes

---

## Files touched (estimate)

| Path | Change |
|------|--------|
| `frontend/src/ui/DocumentHeroCard.tsx` | New |
| `frontend/src/features/quotes/components/QuotePreview.tsx` | Header + hero card swap |
| `frontend/src/features/quotes/components/QuotePreviewHeaderActions.tsx` | Remove StatusPill |
| `frontend/src/features/quotes/components/QuoteDetailsCard.tsx` | Delete |
| `frontend/src/features/quotes/components/LinkedInvoiceCard.tsx` | Delete |
| `frontend/src/features/invoices/components/InvoiceDetailScreen.tsx` | Header + hero card swap |
| `frontend/src/features/quotes/tests/QuotePreview.test.tsx` | Update header + hero assertions |
| `frontend/src/features/invoices/tests/InvoiceDetailScreen.test.tsx` | Update header + hero assertions |

---

## Parent

Design adoption Spec #485 — PR4 closes the hero card consistency gap identified during PR3 review.
