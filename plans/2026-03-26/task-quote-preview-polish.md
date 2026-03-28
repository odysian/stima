# Quote Preview Layout Polish

## Problem Framing

### Goal

Reclaim vertical space on the quote preview screen so Edit and Delete are reachable
without scrolling on a typical quote (3–5 line items). Eliminate the redundant info
currently shown in 3+ places (status, title, client name, doc number). Bundle adjacent
minor design-token inconsistencies found across CustomerListScreen and SettingsScreen.

### Non-Goals

- No backend or API changes
- No changes to the ready/shared status card layout beyond removing the redundant inner block
- No new features or behavioral changes
- No migration or dependency changes

### Constraints

- Frontend-only change
- No-contract refactor — parity lock not applicable (purely visual, no externally
  observable behavior change)
- Must not break existing QuotePreview or QuoteDetailsCard tests; update if snapshots
  are affected

---

## Current Code Context

**Redundancy in `QuotePreview.tsx`:**

- `DRAFT` badge appears in ScreenHeader trailing slot and again inside the status card
  alongside the "PDF STATUS" label (line 300).
- Customer name appears in header title, inside the status card (line 312), and in
  QuoteDetailsCard.
- Doc number appears in header subtitle and inside the status card (line 313).
- The status card's inner block (lines 309–314) reprints `quoteTitle`, `clientName`,
  `doc_number` — all already visible in the header.
- In draft state, the status card communicates nothing the "Generate PDF" button does
  not already imply. It accounts for ~25% of screen height before a single line item.

**Space problem in `QuoteDetailsCard.tsx`:**

- TOTAL AMOUNT and CLIENT are two separate stacked emphasis cards (~180px combined).
- With 3 line items, Edit/Delete buttons are off screen on first load.
- Both cards' content fits on a single horizontal row.

**Minor token issues:**

- `CustomerListScreen.tsx` empty state icons use `text-5xl`; `QuoteList.tsx` and the
  design spec call for `text-3xl`.
- `SettingsScreen.tsx` save success toast uses `rounded-md` (non-token); should be
  `rounded-lg`.
- `SettingsScreen.tsx` Account section labels (`text-xs uppercase tracking-wide`) don't
  match the canonical label style (`text-[0.6875rem] font-bold uppercase tracking-widest
  text-outline`).

---

## Proposed Implementation Plan

1. **`QuoteDetailsCard.tsx`** — Replace two stacked cards with a single card: client
   name + contact info on the left, total amount on the right. Use `border-l-4
   border-primary ghost-shadow` emphasis card pattern. This saves ~80–90px.

2. **`QuotePreview.tsx` — remove inner redundant block** — Delete the
   `quoteTitle`/`clientName`/`doc_number` display block inside the status card
   (lines 308–315). These are already in the ScreenHeader and QuoteDetailsCard.

3. **`QuotePreview.tsx` — hide status card in draft state** — Wrap the status card
   section in a `cardState !== "draft"` condition. In draft, the Generate PDF button
   is self-documenting. For ready/shared, the card earns its place (meaningful state
   change, different icon color).

   **Test impact:** Three assertions in `QuotePreview.test.tsx` will break and must
   be updated:
   - `"fetches quote on mount..."` — asserts `getAllByText("Draft").toHaveLength(2)`
     (header badge + status card badge); becomes 1 after hiding the card.
   - Same test — asserts `getByText("PDF not generated")` and the description text;
     both disappear with the card.
   - `"renders amount and falls back to customer_id..."` — asserts
     `getAllByText("cust-1").toHaveLength(2)`; the second occurrence is the inner
     block being removed, so this becomes 1.

4. **`QuotePreview.tsx` — fix header title fallback** — Change the `title` prop from
   `quoteTitle ?? quote?.doc_number ?? "Quote Preview"` to
   `quoteTitle ?? readOptionalQuoteText(quote, "customer_name") ?? quote?.doc_number ?? "Quote Preview"`.

   **Do not use the `clientName` variable as the intermediate fallback.** `clientName`
   is never null — it falls through to `quote?.customer_id ?? "Unknown customer"`,
   which would surface a UUID as the screen title. Use `readOptionalQuoteText(quote,
   "customer_name")` directly; it returns null for blank/missing values.

   Also update the `subtitle` prop: currently it shows `doc_number` only when
   `quoteTitle` is set. After this change it should show `doc_number` whenever it is
   not acting as the primary title — i.e., when either `quoteTitle` or `customer_name`
   is the title. Concretely: `subtitle={quoteTitle || readOptionalQuoteText(quote, "customer_name") ? quote?.doc_number : undefined}`.

5. **Minor token fixes** — `CustomerListScreen.tsx` has two empty-state sections
   (`showNoCustomersState` and `showNoSearchMatches`), each with `text-5xl`; both
   need `text-3xl`. `SettingsScreen.tsx` success toast `rounded-md` → `rounded-lg`;
   Account section field labels (`text-xs uppercase tracking-wide`) updated to
   canonical style (`text-[0.6875rem] font-bold uppercase tracking-widest text-outline`)
   — two labels affected: "Email" and "Session".

---

## Acceptance Criteria

- Quote preview in draft state: status card not rendered; Generate PDF button appears
  directly after header
- Quote preview in ready/shared state: status card renders without the inner
  quoteTitle/clientName/doc_number block
- QuoteDetailsCard: single card, client name + contact left, amount right
- Header title fallback order: `title → customer_name → doc_number`; doc_number
  appears in subtitle slot when customer_name is used as title
- CustomerListScreen empty state icons use `text-3xl`
- SettingsScreen success toast uses `rounded-lg`; Account section labels match
  canonical label style

## Files In Scope

- `frontend/src/features/quotes/components/QuotePreview.tsx`
- `frontend/src/features/quotes/components/QuoteDetailsCard.tsx`
- `frontend/src/features/customers/components/CustomerListScreen.tsx`
- `frontend/src/features/settings/components/SettingsScreen.tsx`
- `frontend/src/features/quotes/tests/` (update if QuotePreview/QuoteDetailsCard
  render tests are affected)

## Verification Plan

```bash
make frontend-verify
```

---

## Recommended Task Issue Body

```md
## Summary

Compact the quote preview screen to eliminate redundant information and reclaim vertical
space. With the current layout, Edit and Delete are pushed off screen with just 3 line
items. Bundle minor design-token inconsistencies on CustomerListScreen and SettingsScreen.

## Goal

Make quote preview screen-efficient: status, title, and client visible once each; Edit
and Delete reachable without scrolling on a typical quote.

## Non-Goals

- No backend or API changes
- No changes to ready/shared state card content beyond removing the redundant inner block
- No new features

## Scope

**QuotePreview — remove redundancy and compress layout:**
- Hide status card entirely in draft state (Generate PDF button is self-documenting)
- Remove the inner quoteTitle/clientName/doc_number block from the status card (all
  states — already shown in header and details section)
- Change header title fallback order to `title → customer_name → doc_number`

**QuoteDetailsCard — merge stacked cards into one row:**
- Replace two stacked emphasis cards (TOTAL AMOUNT + CLIENT) with a single card:
  client name + contact left, total amount right

**Minor token fixes:**
- CustomerListScreen: empty state icons `text-5xl` → `text-3xl` (matches QuoteList
  and design spec)
- SettingsScreen: success toast `rounded-md` → `rounded-lg`; Account section labels
  to canonical `text-[0.6875rem] font-bold uppercase tracking-widest text-outline`

## Acceptance Criteria

- [ ] Draft state quote preview: status card not rendered; Generate PDF button is the
      first interactive element below the header
- [ ] Ready/shared state quote preview: status card rendered without
      quoteTitle/clientName/doc_number inner block
- [ ] QuoteDetailsCard: single card with client info left, total amount right
- [ ] Header title fallback: `title → customer_name → doc_number`; doc_number in
      subtitle slot when customer_name is used as primary title
- [ ] CustomerListScreen empty state icon size: `text-3xl`
- [ ] SettingsScreen success toast: `rounded-lg`
- [ ] SettingsScreen Account labels: canonical section label style

## Verification

```bash
make frontend-verify
```

## Files In Scope

- `frontend/src/features/quotes/components/QuotePreview.tsx`
- `frontend/src/features/quotes/components/QuoteDetailsCard.tsx`
- `frontend/src/features/customers/components/CustomerListScreen.tsx`
- `frontend/src/features/settings/components/SettingsScreen.tsx`
- `frontend/src/features/quotes/tests/` (update render tests if affected)
```

## Suggested `gh` Command

```bash
gh issue create \
  --title "Polish: compact quote preview layout and fix minor token inconsistencies" \
  --label "type:task" \
  --label "area:quotes" \
  --label "area:frontend" \
  --body-file plans/2026-03-26/task-quote-preview-polish.md
```
