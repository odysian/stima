## Task: Reskin Home Screen — Quote List, Stats Bar, FAB, and Bottom Nav

**Type:** `type:task`
**Labels:** `area:frontend`, `area:quotes`, `area:backend`
**Depends on:** Design Foundation task (#37) — tokens, `BottomNav`, `StatusBadge` must be merged first
**Note:** This task includes a small backend API contract change (`item_count` on the quote list response). The backend change must land in the same PR as the frontend consumption.

---

### Goal

Reskin `QuoteList.tsx` to match the Stitch home screen design and add `item_count` to the quote list API so each card can display how many line items a quote contains. The item count gives contractors a quick visual cue about job complexity without opening the quote.

### Non-Goals

- Do not change quote data fetching, sorting, or pagination logic beyond the `item_count` addition
- Do not add server-side search filtering — client-side filter on the already-loaded list is sufficient
- Do not add pagination

---

### Background and Design Reference

Design reference: `plans/2026-03-22/stitch-design-notes.md` section 3 — "Home (Quote List)"

Stitch HTML source: `stitch_stima_home/stima_home_refined/code.html`
Screen PNG: `stitch_stima_home/stima_home_refined/screen.png`

Key design decisions per design notes:
- **No fixed header** — "Stima Quotes" title is inline, not a sticky top bar
- **Tonal surface shifts, not borders** — white cards (`bg-surface-container-lowest`) float on `bg-background` (#f8f9ff) page; the contrast is the separator
- **Stats bar** — two tiles, green left border for active count, amber for pending review count
- **FAB** — green circle fixed `bottom-20 right-4`, clears the bottom nav

---

### Implementation Plan

**Step 1 — Backend: add `item_count` to quote list response**

This is a read-only query addition. No migration needed.

Files to change in `backend/app/features/quotes/`:

**`repository.py`** — find `QuoteListItemSummary` dataclass/namedtuple and add `item_count: int`. Update the `list_by_user` query to include a correlated COUNT subquery or LEFT JOIN against the `line_items` table. The `line_items` table has a `document_id` foreign key. Example pattern:
```python
# In the SELECT, add a scalar subquery:
select(func.count()).where(LineItem.document_id == Document.id).scalar_subquery().label("item_count")
```
Read the existing `list_by_user` query first to understand the current SELECT shape before modifying it.

**`schemas.py`** — add `item_count: int` to `QuoteListItemResponse`. This is the Pydantic schema returned by `GET /api/quotes`.

**`service.py`** — `list_quotes` passes through the repository result; no change needed unless the mapping needs updating.

Verify the backend change with:
```bash
cd backend && ruff check . && mypy . && pytest
```

**Step 2 — Frontend: add `item_count` to quote types**

In `frontend/src/features/quotes/types/quote.types.ts`, add `item_count: number` to `QuoteListItem`:
```ts
export interface QuoteListItem {
  id: string;
  customer_id: string;
  customer_name: string;
  doc_number: string;
  status: QuoteStatus;
  total_amount: number | null;
  item_count: number;   // new
  created_at: string;
}
```

Update the MSW handler for `GET /api/quotes` in `frontend/src/shared/tests/mocks/handlers.ts` to include `item_count` in mock quote list items. Existing tests that assert on list items will need this field added to their fixtures.

**Step 3 — Page title and stats bar**

Replace any existing fixed header with an inline title section at the top of the scrollable content area:
```tsx
<div className="px-4 pt-6 pb-4">
  <h1 className="font-headline text-2xl font-bold tracking-tight text-primary">Stima Quotes</h1>
</div>
```

Stats bar — two side-by-side tiles in a `grid grid-cols-2 gap-3 px-4 mb-4`. Each tile is `bg-surface-container-lowest rounded-lg p-4 ghost-shadow`:
- Left tile: `border-l-4 border-primary`. Label: `"ACTIVE QUOTES"` in `text-[0.6875rem] font-bold uppercase tracking-widest text-outline`. Value: count in `font-headline text-3xl font-bold text-on-surface`.
- Right tile: `border-l-4 border-amber-500`. Label: `"PENDING REVIEW"`. Value: count.

Count derivation — annotate with a comment in code:
- Active: quotes where `status === "ready" || status === "shared"`
- Pending: quotes where `status === "draft"`

**Step 4 — Search input**

Full-width search `Input` below the stats bar. Props:
- `placeholder="Search customer or quote ID..."`
- `value` + `onChange` wired to local `searchQuery` state
- Filter the displayed quote list: match against `customer_name` or `doc_number`, case-insensitive

**Step 5 — Quote list section header and cards**

Section heading row (`px-4 mb-2 flex justify-between items-center`):
- Left: `"PAST QUOTES"` — `text-[0.6875rem] font-bold text-outline uppercase tracking-widest`
- Right: `"Sorted by: Most Recent"` — same style

**Quote card** (`bg-surface-container-lowest rounded-lg p-4 ghost-shadow mb-2`):
- Row 1: customer name (`font-headline font-bold text-on-surface`) left + `StatusBadge variant={quote.status}` right
- Row 2: `{quote.doc_number}` + `" · "` + formatted date — `text-sm text-on-surface-variant`
- Row 3: `"{quote.item_count} items"` — `text-xs text-outline`
- Row 4: total amount — `font-bold text-on-surface` right-aligned (show `"—"` if null)

Each card taps to `/quotes/${quote.id}/preview`.

**Empty state** (no quotes after filter): centered `text-sm text-outline` with icon `description` above it. Message: `"No quotes yet. Tap + to create your first."` when no quotes at all; `"No quotes match your search."` when filter returns nothing.

**Step 6 — FAB**

Fixed bottom-right, clears bottom nav:
```tsx
<button
  className="fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full forest-gradient text-white shadow-[0_0_24px_rgba(0,0,0,0.12)] flex items-center justify-center active:scale-95 transition-all"
  onClick={() => navigate("/quotes/new")}
>
  <span className="material-symbols-outlined">add</span>
</button>
```

**Step 7 — Wire BottomNav**

Render `<BottomNav active="quotes" />` at the bottom of the component output. The nav is `fixed` so it overlays content — add `pb-24` to the page container so the last quote card is not obscured.

**Step 8 — Update tests**

- Update `QuoteList.test.tsx`: add `item_count` to all mock quote fixtures. Update any class-based assertions to match new layout. Add tests: BottomNav renders with `active="quotes"`, search input filters by customer name, search input filters by doc number, empty state shows correct message.

---

### Decision Lock — `item_count` Strategy

**Chosen:** Add `item_count` to the list query as a COUNT subquery. No migration.

**Alternative considered:** Fetch full `Quote` objects for the list (includes `line_items` array). Rejected — N+1 round trips for a list view is a non-starter.

**Alternative considered:** Show nothing / dash until user opens the quote. Rejected — the count is genuinely useful at a glance and worth the small query cost.

**Revisit trigger:** If the quote list becomes very large (thousands of rows) and the COUNT subquery causes measurable latency, cache the count in a denormalized column on `documents`. Not needed now.

---

### Acceptance Criteria

- [ ] `GET /api/quotes` response includes `item_count: int` for each list item
- [ ] `QuoteListItemResponse` Pydantic schema includes `item_count`
- [ ] `QuoteListItem` TypeScript interface includes `item_count: number`
- [ ] `QuoteList` renders `"Stima Quotes"` as an inline h1 — no fixed top header
- [ ] Stats bar renders two tiles with green/amber left borders and correct counts
- [ ] Search input filters displayed quotes by customer name or doc number (case-insensitive, client-side)
- [ ] Quote cards use `bg-surface-container-lowest ghost-shadow` — no hard borders
- [ ] Each quote card shows: customer name (headline bold), doc number + date (muted), item count (xs outline), total (bold right), `StatusBadge`
- [ ] FAB is `fixed bottom-20 right-4`, forest gradient, navigates to `/quotes/new`
- [ ] `BottomNav` renders with `active="quotes"`
- [ ] Content has `pb-24` so last card clears the fixed bottom nav
- [ ] Both empty states (no quotes / no search matches) render
- [ ] All existing backend quote list tests pass with the new field
- [ ] All existing `QuoteList` frontend tests pass; new tests for search filter and BottomNav added
- [ ] `make backend-verify` and `make frontend-verify` both pass cleanly

---

### Files in Scope

Backend:
```
backend/app/features/quotes/repository.py   (add item_count to list query + QuoteListItemSummary)
backend/app/features/quotes/schemas.py      (add item_count to QuoteListItemResponse)
```

Frontend:
```
frontend/src/features/quotes/types/quote.types.ts
frontend/src/features/quotes/components/QuoteList.tsx
frontend/src/shared/tests/mocks/handlers.ts  (add item_count to mock list fixtures)
```

Tests to update:
```
frontend/src/features/quotes/tests/QuoteList.test.tsx
frontend/src/features/quotes/tests/quoteService.integration.test.ts  (QuoteListItem[] fixtures need item_count field)
backend/app/features/quotes/tests/test_quotes.py  (update list response assertions to include item_count)
```

---

### Files Explicitly Out of Scope

- `quoteService.ts` (frontend) — no service changes beyond the type update
- `useQuoteDraft.ts`, `useVoiceCapture.ts` — no changes
- `App.tsx` — no routing changes
- All other feature screens

---

### Verification

```bash
make backend-verify
make frontend-verify
```

Raw fallback:
```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
