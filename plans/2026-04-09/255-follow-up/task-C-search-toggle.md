## Task C: Home list search toggle

Progressive disclosure for the QuoteList search bar. The bar is always-visible today but search is
a secondary action — most sessions are browse-only. Hiding it behind a toggle frees vertical space
on the densest screen in the app without sacrificing discoverability.

---

## Acceptance criteria

1. The `QuoteList` search bar is hidden on initial render (`isSearchOpen` defaults to `false`).
2. A magnifying glass ghost icon button (`search` Material Symbol) sits in the trailing slot of the
   tab pills row, right-aligned, visible whenever the bar is closed.
3. Tapping the search icon opens the search bar and moves focus into the input.
4. When the bar is open, the search icon is hidden. A `×` close button is the sole close affordance
   — rendered inside or directly adjacent to the input field.
5. Tapping `×` closes the bar and resets `searchQuery` to `""` in one operation.
6. Re-opening the bar always starts with an empty input — no query persistence.
7. Switching tabs (Quotes ↔ Invoices) preserves both `isSearchOpen` and the current `searchQuery`.
   The query is cleared only when the user explicitly taps `×`.
8. The empty-state message ("No quotes match your search") is unchanged and still appears correctly
   when a query yields no results.
9. `make frontend-verify` passes.

---

## Design notes

### Tab row restructure

The current tab row is:

```tsx
<div className="mb-4 px-4">
  <div aria-label="Document type filter" className="mb-4 inline-flex rounded-full ...">
    {/* Quotes | Invoices pills */}
  </div>
  <Input ... />   {/* always visible */}
</div>
```

New structure:

```tsx
<div className="mb-4 px-4">
  <div className="mb-4 flex items-center justify-between gap-3">
    <div aria-label="Document type filter" className="inline-flex rounded-full ...">
      {/* Quotes | Invoices pills — unchanged */}
    </div>
    {!isSearchOpen ? (
      <button
        type="button"
        aria-label="Open search"
        className="cursor-pointer p-2 rounded-full text-outline hover:bg-surface-container-low active:scale-95 transition-all"
        onClick={() => setIsSearchOpen(true)}
      >
        <span className="material-symbols-outlined">search</span>
      </button>
    ) : null}
  </div>

  {isSearchOpen ? (
    <div className="relative mb-4">
      <Input
        ref={searchInputRef}
        label={searchLabel}
        id="document-search"
        placeholder={searchPlaceholder}
        hideLabel
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />
      <button
        type="button"
        aria-label="Close search"
        className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1 text-outline hover:bg-surface-container-low active:scale-95 transition-all"
        onClick={() => { setSearchQuery(""); setIsSearchOpen(false); }}
      >
        <span className="material-symbols-outlined text-base">close</span>
      </button>
    </div>
  ) : null}
</div>
```

**Focus on open:** `useEffect` watching `isSearchOpen` — when it transitions to `true`, call
`searchInputRef.current?.focus()`. Requires forwarding a ref to `Input` or using an `id`-based
`document.getElementById` fallback if `Input` does not accept a ref today.

Check whether `Input` currently accepts `ref` forwarding. If not, a one-line `forwardRef` wrapper
on `Input` or the `id`-based approach is acceptable — prefer whichever is less invasive.

### Tab switch behavior

Switching between the Quotes and Invoices pills should preserve both `isSearchOpen` and the current
`searchQuery`. This treats the two lists as sibling views within the same search session, which is
more useful when the user wants to look up the same customer or job across both. Only the explicit
close `×` action should reset the query.

---

## Files in scope

| File | Change |
|---|---|
| `frontend/src/features/quotes/components/QuoteList.tsx` | Add `isSearchOpen` state + `searchInputRef`; restructure tab row; conditionally render `Input` with close button |
| `frontend/src/features/quotes/tests/QuoteList.test.tsx` | Update existing search tests for the hidden-by-default input; add: search icon present; tapping opens bar + focuses input; `×` closes and resets; re-open is empty; tab switching preserves open state and query; empty-state copy remains unchanged once search is opened |

---

## Do NOT change

- `Input` component internals (use as-is or add `forwardRef` only if ref forwarding is needed)
- `ScreenHeader` (stat subtitle stays as-is)
- Any other QuoteList logic (filtering, empty state, section rendering)
- Any backend files

---

## Verification

```bash
make frontend-verify
cd frontend && npx vitest run src/features/quotes/tests/QuoteList.test.tsx
```
