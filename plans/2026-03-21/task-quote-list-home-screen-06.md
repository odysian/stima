# Task: Quote List / Home Screen (V0 Task 6)

## Goal

Replace the placeholder `AppShell` at `/` with a real home screen that shows the
user's quotes. A contractor can see all their quotes at a glance, search by customer
name or quote number, tap into a quote to generate or share a PDF, and start a new
quote. This is the last screen needed before the app is navigable without knowing
internal URLs.

## Parent Roadmap Reference

`docs/V0_ROADMAP.md` § Task 6 — Quote List / Home Screen

---

## Locked Design Decisions

### Dedicated list DTO for `GET /api/quotes`, not frontend join and not a global `QuoteResponse` change

To set up a stronger foundation, `GET /api/quotes` should return a dedicated list
shape rather than reusing the full detail payload. Add a new backend response model,
for example `QuoteListItemResponse`, that includes exactly the fields the home screen
needs:

- `id`
- `customer_id`
- `customer_name`
- `doc_number`
- `status`
- `total_amount`
- `created_at`

This keeps the backend as the source of truth for screen-ready quote summaries, avoids
teaching clients to join quotes with customers, and avoids overfetching detail-only
fields like `transcript`, `notes`, `line_items`, `share_token`, and `updated_at` on
the home screen.

Implementation guardrail: do not implement the summary endpoint by loading full
`Document` models plus `line_items` and trimming fields at the API layer. The list
endpoint should query only the summary fields it needs and join customer data once in
the backend.

Do not add `customer_name` to the existing `QuoteResponse` used by create/detail/update/share
endpoints. That would couple a list-screen concern to every quote response in the API.

**Alternative considered:** Client-side join with `GET /api/customers`. Rejected as a
short-term convenience that pushes backend view-model composition into the frontend.

### Row tap → QuotePreview (`/quotes/:id/preview`)

`QuotePreview` is the fully built action screen (generate PDF, share). Tapping a
list row routes there directly. There is no separate lightweight detail screen —
`QuotePreview` is the canonical view of a quote.

### Client-side search filter

Search filters by customer name or doc number on the already-fetched list. No
server-side filtering param in V0 — the list is small and client-side is instant.
Controlled input, filters on every keystroke (no submit-on-Enter).

### Settings nav → placeholder route until Task 7

Add a `/settings` route in `App.tsx` that renders a minimal placeholder div. The
nav link is present and functional. Task 7 implements the real settings screen using
the already-wired `PATCH /api/profile` endpoint.

### List is loaded once on mount, no polling

No real-time updates or focus-based refresh. `QuoteList` refetches when `/` mounts,
so normal navigation back to the home screen will naturally reload data. Persistent
background syncing is a Task 7+ concern.

### MSW handler ordering

The existing base handler for `GET /api/quotes/:id` uses a path param `:id`. Adding
`GET /api/quotes` (no path segment after `/quotes`) is safe in MSW because exact
paths match before parameterised ones. The list handler must be registered before
the detail handler in the handlers array to be explicit.

---

## Considerations / Follow-Ups

- **Roadmap drift:** `docs/V0_ROADMAP.md` currently frames Task 6 as frontend-only.
  This plan intentionally expands scope slightly to improve the long-term API
  contract. If implementation follows this plan, update the roadmap note and
  `docs/ARCHITECTURE.md` in the same Task so repo docs stay aligned.

- **Empty state:** A list with zero quotes is the first thing a new onboarded user
  sees. The empty state should be actionable ("No quotes yet — create your first
  one") rather than just blank.

- **Status badge colours:** The spec defines three statuses (`draft`, `ready`,
  `shared`). Use simple inline Tailwind classes rather than a shared badge component
  to keep scope tight. A shared `StatusBadge` component is a candidate for Slice 2
  cleanup.

- **Pagination:** `GET /api/quotes` is ordered `created_at DESC`. No pagination in
  V0 — the backend roadmap notes page/limit params are optional and deferred. Add a
  note in the PR if the list grows unmanageably in pilot testing.

- **Summary/detail split:** Once Task 6 introduces a dedicated list DTO, keep the
  boundary clean. Do not let home-screen-only fields creep into `QuoteResponse`, and
  do not let detail-only fields creep back into the list contract.

---

## Scope

### Backend

**`backend/app/features/quotes/schemas.py`**
- Add a dedicated `QuoteListItemResponse` model for `GET /api/quotes`
- Keep existing `QuoteResponse` for create/detail/update/share responses

**`backend/app/features/quotes/repository.py`**
- Add a list-specific query that joins `Document` to `Customer` and returns quote
  summary rows ordered by `created_at DESC, doc_sequence DESC` to preserve the
  current deterministic ordering behavior
- Use a column-level `select(...)` against `Document` + `Customer`, returning mapped
  summary rows rather than ORM `Document` instances
- Prefer a dedicated summary dataclass or row-mapping shape rather than hydrating full
  `Document` models for the list endpoint
- Do not eager-load `line_items` or fetch detail-only columns for the list query
- Keep detail/render-context queries unchanged

**`backend/app/features/quotes/service.py`**
- Return the new list-summary shape from `list_quotes`
- Keep detail/create/update/share service contracts unchanged

**`backend/app/features/quotes/api.py`**
- Change `GET /api/quotes` to `response_model=list[QuoteListItemResponse]`
- Serialize the new list-summary shape explicitly
- Leave all other quote endpoints on `QuoteResponse`

**`backend/app/features/quotes/tests/test_quotes.py`** (extend)
- Lock the new `GET /api/quotes` contract including `customer_name`
- Assert the list response preserves newest-first deterministic ordering
- Assert the list response is intentionally lightweight and does not expose
  detail-only fields such as `transcript`, `notes`, or `line_items`
- Add a query-shape assertion if practical, or at minimum a regression comment/test
  that documents the endpoint must not depend on detail-style loading

**`docs/ARCHITECTURE.md`**
- Update the quote API contract so `GET /api/quotes` documents the new list item
  shape rather than `Quote[]`

**`docs/V0_ROADMAP.md`**
- Update the Task 6 backend note to reflect the intentional list-response contract
  improvement

### Frontend

**`frontend/src/features/quotes/types/quote.types.ts`**
- Add a dedicated `QuoteListItem` type that matches the new list endpoint contract
- Keep `Quote` as the detail/create/update/share shape

**`frontend/src/features/quotes/components/QuoteList.tsx`** (implement from stub)
- Fetches quote summaries on mount via `quoteService.listQuotes()`
- Loading state while fetching
- Error state if fetch fails
- Empty state: "No quotes yet" with a prompt to create the first one
- Reuse shared `Input` and `Button` components to stay visually consistent with the
  rest of the app
- Search input: client-side filter on `customer_name` and `doc_number`,
  case-insensitive, filters on every keystroke
- Quote rows: customer name, doc number, created date, total amount
  (blank if null), status badge (`draft` / `ready` / `shared`)
- Row tap → `navigate(\`/quotes/${quote.id}/preview\`)`
- Floating "New Quote" button → `/quotes/new`
- Settings nav link → `/settings`

**`frontend/src/features/quotes/services/quoteService.ts`**
- Add `listQuotes(): Promise<QuoteListItem[]>` → `GET /api/quotes`

**`frontend/src/App.tsx`**
- Replace `AppShell` import and usage at `/` with `QuoteList`
- Remove `AppShell` function (it has no other usage)
- Add `/settings` route: `<Route path="/settings" element={<div>Settings coming soon</div>} />`
  inside `ProtectedRoute`

**`frontend/src/shared/tests/mocks/handlers.ts`**
- Add `GET /api/quotes` list handler returning two fixture quote summaries with
  `customer_name`
- Register before the existing `GET /api/quotes/:id` handler for clarity

### Tests

**`frontend/src/features/quotes/tests/QuoteList.test.tsx`** (create)
- Renders quote rows from mocked quote summaries (customer name, doc number,
  status visible)
- Renders empty state when list is empty
- Search input filters visible rows by customer name
- Search input filters visible rows by doc number
- Row tap navigates to `/quotes/:id/preview`
- Loading state renders while fetch is in flight
- Error state renders if fetch fails

**`frontend/src/features/quotes/tests/quoteService.integration.test.ts`** (extend)
- Add `listQuotes` integration test locking the `GET /api/quotes` summary contract,
  including `customer_name`

**`frontend/src/features/auth/tests/App.routes.test.tsx`** (modify)
- Update authenticated-route expectations now that `/` renders `QuoteList` instead of
  the placeholder `AppShell`
- Keep the existing auth redirect assertions intact

---

## File Targets

| File | Action | Purpose |
|---|---|---|
| `backend/app/features/quotes/schemas.py` | Modify | Add dedicated list response schema |
| `backend/app/features/quotes/repository.py` | Modify | Add list-summary query joined to customers |
| `backend/app/features/quotes/service.py` | Modify | Return list summaries for `GET /api/quotes` |
| `backend/app/features/quotes/api.py` | Modify | Use list-specific response model for `GET /api/quotes` |
| `backend/app/features/quotes/tests/test_quotes.py` | Modify | Lock list-summary contract and lightweight shape |
| `docs/ARCHITECTURE.md` | Modify | Document `GET /api/quotes` as a summary contract |
| `docs/V0_ROADMAP.md` | Modify | Note Task 6 intentionally improves list response contract |
| `frontend/src/features/quotes/types/quote.types.ts` | Modify | Add `QuoteListItem` type |
| `frontend/src/features/quotes/services/quoteService.ts` | Modify | Add `listQuotes()` returning quote summaries |
| `frontend/src/features/quotes/components/QuoteList.tsx` | Implement | Home screen with list, search, empty state, nav |
| `frontend/src/App.tsx` | Modify | Replace `AppShell` with `QuoteList`, add `/settings` placeholder |
| `frontend/src/shared/tests/mocks/handlers.ts` | Modify | Add `GET /api/quotes` list handler |
| `frontend/src/features/quotes/tests/QuoteList.test.tsx` | Create | Component tests for list, search, nav, states |
| `frontend/src/features/quotes/tests/quoteService.integration.test.ts` | Modify | Add `listQuotes` contract test |
| `frontend/src/features/auth/tests/App.routes.test.tsx` | Modify | Update `/` route expectations after replacing `AppShell` |

---

## Acceptance Criteria

### Backend
- [ ] `GET /api/quotes` returns a dedicated summary shape, not full `QuoteResponse`
- [ ] Each list item includes `customer_name`
- [ ] List query is ordered `created_at DESC, doc_sequence DESC` and joined to customer data in the backend
- [ ] List query does not eager-load `line_items` or depend on full detail-model hydration
- [ ] Detail/create/update/share quote contracts remain on the existing full `QuoteResponse`
- [ ] `docs/ARCHITECTURE.md` documents the new list contract

### Frontend
- [ ] `/` renders `QuoteList` (not `AppShell`)
- [ ] List fetches on mount, shows loading state, error state, and empty state
- [ ] Each row shows customer name, doc number, date, total (blank if null), and
      status badge
- [ ] Search filters rows by customer name and doc number, case-insensitive
- [ ] Row tap navigates to `/quotes/:id/preview`
- [ ] "New Quote" button navigates to `/quotes/new`
- [ ] Settings nav link navigates to `/settings`
- [ ] `/settings` route renders without error (placeholder content)
- [ ] `listQuotes` MSW handler is registered and its contract is locked in integration test
- [ ] Auth route tests are updated for the new home screen
- [ ] All component and integration tests pass

### DoD gate (Task 6 complete)
- [ ] A user can log in, see their quote list, search it, tap into a quote, and start a new one
- [ ] `make backend-verify` passes
- [ ] `make frontend-verify` passes

---

## Verification

```bash
make backend-verify
make frontend-verify
```

Fallback:
```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
