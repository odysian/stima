## Scope

After Task A establishes the new card pattern on QuoteList, apply the same tonal background + card spacing + active state + border radius to all other list screens. This is mechanical work — the pattern is defined in Task A.

**Depends on:** Task A must be merged first.

Parent spec: #82 (Spec: Quote list UI polish)

## Screens to update

### `CustomerListScreen.tsx`

- Wrap list in tonal container: `<div className="mx-4 rounded-xl bg-surface-container-low p-3"><ul className="flex flex-col gap-3">...</ul></div>`.
- Update active state: `active:scale-[0.98] active:bg-surface-container-low`.
- Update border radius: `rounded-xl`.
- Card content layout unchanged (name + contact is already a clean 2-line layout).

### `CustomerSelectScreen.tsx`

- Same tonal container + gap + active state + radius changes.
- Card layout unchanged.

### `QuoteHistoryList.tsx`

- Same tonal container + gap + active state + radius changes.
- Apply 2-line card layout, adapted for context (customer name is already known from the parent screen):
  ```
  Row 1: [Q-001]                    [$1,250.00]
  Row 2: [Mar 14 · 3 items]          [DRAFT]
  ```
  - Row 1: `flex items-baseline justify-between gap-3`. Doc number left, total right (`font-headline font-bold text-on-surface`).
  - Row 2: `flex items-center justify-between gap-3 mt-1`. Date + item count left (`text-sm text-on-surface-variant`), status badge right.
  - Item count: correct singular/plural (`"1 item"` / `"N items"`).
  - Note: if a quote title field is added later, it replaces doc number as the row 1 left field — layout pattern unchanged.

### `LineItemCard.tsx`

- Active state and radius changes only (`active:scale-[0.98] active:bg-surface-container-low`, `rounded-xl`).
- No tonal container — line items are within a single quote context, not a browsable list.

## Files touched

- `frontend/src/features/customers/components/CustomerListScreen.tsx`
- `frontend/src/features/customers/components/CustomerSelectScreen.tsx`
- `frontend/src/features/customers/components/QuoteHistoryList.tsx`
- `frontend/src/features/quotes/components/LineItemCard.tsx`

## Acceptance criteria

- [ ] All list screens use `bg-surface-container-low` tonal container around their list regions
- [ ] All list cards use `gap-3` spacing
- [ ] All list cards use `active:scale-[0.98] active:bg-surface-container-low` active state
- [ ] All list cards use `rounded-xl` border radius
- [ ] QuoteHistoryList quote cards use the 2-line layout: doc number + total on row 1, date + item count + status badge on row 2
- [ ] No layout regressions on customer screens
- [ ] All existing tests pass (update if they assert specific classes or DOM structure)
- [ ] `make frontend-verify` passes

## Verification

```bash
make frontend-verify
```
