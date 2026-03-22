# Task A: Quote detail visibility — line items on QuotePreview, transcript on ReviewScreen, key fix

**Parent Spec:** [Tier 2 — Quote UX & management improvements](spec-tier2-quote-ux-management.md)
**Mode:** gated child task
**Type:** no-contract refactor (frontend-only, no API changes)

## Summary

Three small, self-contained UI improvements that increase information visibility without changing any behavior or API contracts.

## Scope

### 1. Show line items on QuotePreview

**Problem:** QuotePreview shows only the total amount and customer info. The `QuoteDetail` response already includes `line_items: LineItem[]` (with `id`, `description`, `details`, `price`, `sort_order`) but they aren't rendered. Users must generate the PDF just to see what's in the quote.

**Solution:** Add a line items section between the PDF preview area and the `<QuoteDetailsCard>`. The section lands in `QuotePreview.tsx` directly, between `<ShareLinkRow>` and `<QuoteDetailsCard>` in the render tree.

```tsx
<section className="mx-4 mt-4">
  <div className="flex items-center justify-between mb-2">
    <h2 className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
      LINE ITEMS
    </h2>
    <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
      {quote.line_items.length} ITEMS
    </span>
  </div>
  <ul className="space-y-2">
    {quote.line_items.map((item) => (
      <li key={item.id} className="flex items-start justify-between rounded-lg bg-surface-container-lowest p-3 ghost-shadow">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-on-surface">{item.description}</p>
          {item.details ? (
            <p className="mt-1 text-sm text-on-surface-variant">{item.details}</p>
          ) : null}
        </div>
        <p className="ml-4 font-bold text-on-surface shrink-0">
          {item.price !== null ? formatCurrency(item.price) : "TBD"}
        </p>
      </li>
    ))}
  </ul>
</section>
```

Uses `formatCurrency` from `@/shared/lib/formatters` (already used by `QuoteDetailsCard`). This is read-only — no edit or delete buttons. Each item uses `item.id` (UUID from the database) as the key, which is stable.

### 2. Show transcript on ReviewScreen

**Problem:** The extraction produces a `transcript` stored in the draft, but ReviewScreen never displays it. Users can't reference what was said or typed during capture.

**Solution:** Add a collapsible transcript section between the AI confidence banner and the line items header. Collapsed by default to keep the focus on line items.

```tsx
// Render between AIConfidenceBanner and the "Line Items" header:
{currentDraft.transcript.trim().length > 0 ? (
  <details className="rounded-lg bg-surface-container-low">
    <summary className="cursor-pointer px-4 py-3 text-xs font-bold uppercase tracking-widest text-outline select-none">
      TRANSCRIPT
    </summary>
    <p className="px-4 pb-3 text-sm text-on-surface-variant whitespace-pre-wrap">
      {currentDraft.transcript}
    </p>
  </details>
) : null}
```

Uses the native `<details>` element with no React state — the browser handles open/close. No controlled state is needed here.

### 3. Fix unstable React keys on ReviewScreen

**Problem:** Line item cards use a composite key that includes mutable content:
```ts
key={`line-item-card-${index}-${lineItem.description}-${lineItem.details ?? ""}`}
```
When a user edits a line item's description or details, the key changes, causing React to unmount and remount the component instead of updating it in place.

**Solution:** Use index-only keys:
```ts
key={`line-item-card-${index}`}
```

Index keys are appropriate here because:
- Line items are not reordered (no drag-and-drop)
- The list identity is positional (editing item at index 2 should update the card at position 2)
- `LineItemCard` is a pure presentational component with no internal state — when indices shift after a mid-list delete, React updates the card's props in place with no stale state to worry about

If reordering is added in the future, line items should get stable IDs at that point.

## Files touched

**Modified:**
- `frontend/src/features/quotes/components/QuotePreview.tsx` (add line items section)
- `frontend/src/features/quotes/components/ReviewScreen.tsx` (add transcript section, fix keys)

## Acceptance criteria

- [ ] QuotePreview renders all line items with description, details, and price (or "TBD" for null)
- [ ] QuotePreview line items use `item.id` as key (stable UUID)
- [ ] ReviewScreen shows a collapsible transcript section when transcript is non-empty
- [ ] Transcript section is collapsed by default
- [ ] ReviewScreen line item cards use index-only keys
- [ ] No API changes, no backend changes
- [ ] All existing tests pass without modification

## Parity lock

- Status code parity: N/A (frontend-only)
- Response schema parity: N/A
- Error semantics parity: same error messages, same rendering
- Side-effect parity: no behavior changes

## Verification

```bash
make frontend-verify
```
