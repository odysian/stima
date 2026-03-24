## Scope

All changes are in or directly affect `QuoteList.tsx`. This is the highest-impact task.

Parent spec: #82 (Spec: Quote list UI polish)

## Changes

### 1. Card layout restructure

Replace the current 4-line card body with a 2-line horizontal layout.

Current:
```
[Customer Name]              [DRAFT]
Q-001 · Mar 14
3 items
                             $1,250.00
```

Target:
```
[Customer Name]              $1,250.00
Q-001 · Mar 14 · 3 items      [DRAFT]
```

- Row 1: `flex items-baseline justify-between gap-3`. Customer name left (`font-headline font-bold text-on-surface`), total right (`font-headline font-bold text-on-surface`). Use `items-baseline` so text baselines align regardless of font size.
- Row 2: `flex items-center justify-between gap-3 mt-1`. Metadata left (`text-sm text-on-surface-variant`): doc number + middot + date + middot + item count. Status badge right.
- Item count format: `"1 item"` / `"N items"` (correct singular/plural).
- Total: call `formatCurrency(quote.total_amount)` directly — the formatter already returns `"—"` for `null`. No additional null check needed.

### 2. List tonal background

Replace `<ul className="px-4 pb-2">` with:

```tsx
<div className="mx-4 rounded-xl bg-surface-container-low p-3">
  <ul className="flex flex-col gap-3">...</ul>
</div>
```

- Remove `mb-2` from `<li>` elements — gap is now on the `<ul>`.
- The "PAST QUOTES" / "Sorted by" header row stays outside this container, above it.

### 3. Stat section compaction

- Remove the `<section className="mb-4 grid grid-cols-2 ...">` block (lines 84–101 of current file) entirely.
- Add after the `<h1>`:
  ```tsx
  <p className="mt-1 text-sm text-on-surface-variant">
    {activeQuoteCount} active{" · "}{pendingReviewCount} pending review
  </p>
  ```
- Keep the `activeQuoteCount` and `pendingReviewCount` memos — only change their rendering.

### 4. Card active state

`active:scale-[0.99]` → `active:scale-[0.98] active:bg-surface-container-low`

### 5. Card border radius

`rounded-lg` → `rounded-xl` on quote card buttons only.

### 6. Search label sr-only

Add optional `hideLabel` boolean prop to `Input`. When `true`, apply `sr-only` to the label element. Pass `hideLabel` from `QuoteList`. No visual change for other `Input` consumers.

## Files touched

- `frontend/src/features/quotes/components/QuoteList.tsx`
- `frontend/src/shared/components/Input.tsx`

## Acceptance criteria

- [ ] Quote cards display customer name and total on the same row
- [ ] Quote cards display doc number, date, item count, and status badge on a second row
- [ ] Item count uses correct singular/plural (`"1 item"` / `"N items"`)
- [ ] Quote list region has a tonal background (`surface-container-low`) with cards on `surface-container-lowest`
- [ ] Card gap is `gap-3` (12px), not `mb-2` (8px)
- [ ] Stat section is a single inline text row, not two tall cards
- [ ] Card press state shows visible background color shift and scale change
- [ ] Card corners use `rounded-xl` (8px)
- [ ] Search input label is visually hidden but accessible to screen readers
- [ ] Null total displays em dash, not `$0.00`
- [ ] Empty state still renders correctly (no quotes, no search matches)
- [ ] Loading and error states still render correctly
- [ ] All existing QuoteList tests pass (update if they assert specific class names or DOM structure)
- [ ] `make frontend-verify` passes

## Tests to update/add

- Update existing QuoteList tests to match the new 2-line card layout.
- Add test: null `total_amount` renders em dash.
- Add test: search label has `sr-only` class.

## Verification

```bash
make frontend-verify
```
