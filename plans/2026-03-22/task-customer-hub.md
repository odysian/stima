## Task: Customer Hub — Customer List and Customer Detail Screens

**Type:** `type:task`
**Labels:** `area:frontend`, `area:customers`
**Depends on:** Design Foundation task (#37) — tokens, `BottomNav` must be merged first

---

### Goal

Add a Customers tab to the app by creating two new screens: `CustomerListScreen` (browsable customer directory at `/customers`) and `CustomerDetailScreen` (per-customer info + quote history + create quote action at `/customers/:id`).

This makes `BottomNav` meaningful — each tab answers a distinct question: *"What are my quotes?"*, *"Who are my customers?"*, *"My account."*

No new backend endpoints are required. All data is available from existing services.

### Non-Goals

- Do not change `customerService.ts` or any customer API endpoint
- Do not change the `CustomerSelectScreen` (used within the quote creation flow — separate screen with different UX intent)
- Do not change `quoteService.ts`
- Do not add customer deletion

---

### Background and Design Reference

**No Stitch exports exist for these screens.** They are composed entirely from existing documented patterns. Each section below maps to a specific source reference.

Design token and component reference: `plans/2026-03-22/stitch-design-notes.md`

Pattern sources used (no new patterns invented):

| Section | Pattern source |
|---|---|
| CustomerListScreen — inline title | Home screen: `font-headline text-2xl font-bold text-primary` inline, no fixed header |
| CustomerListScreen — search input | Home screen search input: full-width `Input` with placeholder |
| CustomerListScreen — customer rows | CustomerSelect (search): design notes line 301 — `bg-surface-container-lowest rounded-lg p-4`, name `font-bold`, contact `text-sm text-on-surface-variant`, `chevron_right` icon |
| CustomerListScreen — FAB "New Customer" | Home screen FAB: same circle, swap icon to `person_add` |
| CustomerListScreen — empty state | Home screen empty state: centered `text-sm text-outline` + icon |
| CustomerDetailScreen — top app bar | Every flow screen: glassmorphism header, design notes line 158 |
| CustomerDetailScreen — editable info card | Settings "Business Profile" card: `bg-surface-container-lowest rounded-xl p-6 ghost-shadow` with stacked `Input` fields and primary "Save Changes" button |
| CustomerDetailScreen — quote history | Home screen quote cards: same `QuoteListItem` card structure |
| CustomerDetailScreen — "Create Quote" button | Primary button: `Button variant="primary"` |
| BottomNav active state | `BottomNav active="customers"` |

**Two distinct creation contexts** — do not conflate them:

| Entry point | Path | Post-create destination |
|---|---|---|
| Customers tab → New Customer | FAB on `/customers` → create form | `/customers/:id` (lands on detail, quote is optional) |
| Home FAB → CustomerSelectScreen → Add New Customer | Existing flow at `/quotes/new` | `/quotes/capture/:customerId` (continues quote flow) |

The `CustomerSelectScreen` at `/quotes/new` keeps its current behaviour unchanged. This task does not touch it.

---

### Implementation Plan

**Step 1 — New `CustomerListScreen.tsx`**

Route: `/customers` (added to `App.tsx` inside `<ProtectedRoute>`)

The screen uses an **inline title** (not a fixed app bar) — same pattern as the Home screen. No fixed header, no back arrow (it is a root-level tab destination).

Layout:
```tsx
<main className="min-h-screen bg-background pb-24">
  {/* Inline title */}
  <div className="px-4 pt-6 pb-4">
    <h1 className="font-headline text-2xl font-bold tracking-tight text-primary">Customers</h1>
  </div>

  {/* Search */}
  <div className="px-4 mb-4">
    <Input placeholder="Search customers..." value={query} onChange={...} />
  </div>

  {/* Customer list */}
  <div className="px-4 flex flex-col gap-2">
    {filteredCustomers.map(customer => (
      <CustomerRow key={customer.id} customer={customer} onClick={() => navigate(`/customers/${customer.id}`)} />
    ))}
  </div>

  {/* FAB */}
  <button
    className="fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full forest-gradient text-white shadow-[0_0_24px_rgba(0,0,0,0.12)] flex items-center justify-center active:scale-95 transition-all"
    onClick={() => navigate("/customers/new")}
  >
    <span className="material-symbols-outlined">person_add</span>
  </button>

  <BottomNav active="customers" />
</main>
```

**Customer row** (inline component or extracted to a small helper in the same file):
```tsx
<button
  className="w-full bg-surface-container-lowest rounded-lg p-4 flex items-center justify-between ghost-shadow text-left active:scale-[0.99] transition-all"
  onClick={onClick}
>
  <div>
    <p className="font-bold text-on-surface">{customer.name}</p>
    <p className="text-sm text-on-surface-variant">{contactLine(customer)}</p>
  </div>
  <span className="material-symbols-outlined text-outline">chevron_right</span>
</button>
```

`contactLine(customer)` — join phone and email with `" · "`, show empty string if neither present.

**Client-side search** — filter `customers` array by `customer.name` (case-insensitive). Same pattern as `CustomerSelectScreen`.

**Data fetching** — call `customerService.listCustomers()` on mount. Same pattern as `CustomerSelectScreen`.

**New customer creation from this screen:**

Option A: FAB → inline slide-up modal with the create form (keeps user on `/customers` list while creating). Simpler state management.

Option B: FAB → navigate to a dedicated `/customers/new` route. Cleaner URL, easier to deep-link.

**Choose Option B** — `/customers/new` route with a `CustomerCreateScreen` component. After successful create, navigate to `/customers/${createdCustomer.id}`. This is more consistent with the rest of the app's screen-per-action pattern.

**Empty state** (no customers): centered layout, `group` icon in `text-outline text-5xl`, `"No customers yet."` in `text-sm text-outline`. Show FAB regardless.

**Step 2 — New `CustomerCreateScreen.tsx`**

Route: `/customers/new` (added to `App.tsx` inside `<ProtectedRoute>`)

**Top app bar** (glassmorphism, fixed):
```tsx
<header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md ...">
  <button onClick={() => navigate("/customers")}><span className="material-symbols-outlined">arrow_back</span></button>
  <h1 className="font-headline font-bold tracking-tight text-primary text-lg">New Customer</h1>
</header>
```

Body: `pt-16 pb-24 px-4`

Fields (all using `Input` component): Full Name (required), Phone Number, Email Address, Address (`<textarea>` with `Input`-equivalent styling).

Error banner (when creation fails) — red left-border card, same pattern as Login error banner.

`"Create Customer →"` — `Button variant="primary"` full-width. On success: navigate to `/customers/${createdCustomer.id}`.

No bottom nav (this is a flow screen, not a root-level tab).

**Step 3 — New `CustomerDetailScreen.tsx`**

Route: `/customers/:id` (added to `App.tsx` inside `<ProtectedRoute>`)

**Top app bar:**
```tsx
<header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md ...">
  <button onClick={() => navigate("/customers")}><span className="material-symbols-outlined">arrow_back</span></button>
  <h1 className="font-headline font-bold tracking-tight text-on-surface text-lg">{customer.name}</h1>
</header>
```

Body: `pt-16 pb-24 px-4 space-y-4`

**Data fetching:**
- `customerService.getCustomer(id)` → customer details
- `quoteService.listQuotes()` → all quotes, then filter client-side by `quote.customer_id === id`
- Fetch both in parallel using `Promise.all` on mount
- Handle loading and error states for each

**"Create Quote" button** — `Button variant="primary"` full-width. Navigates directly to `/quotes/capture/${customer.id}`, bypassing `CustomerSelectScreen` entirely. This works because `CaptureScreen` already reads `customerId` from the URL param.

**Editable customer info card** (`bg-surface-container-lowest rounded-xl p-6 ghost-shadow`) — identical card pattern to the Settings Business Profile card:
- Section heading: `"CUSTOMER INFO"` — `text-[0.6875rem] font-bold uppercase tracking-widest text-outline mb-4`
- Fields: Name (required), Phone, Email, Address (`<textarea>`) — all using `Input` component wired to local form state
- `"Save Changes"` — `Button variant="primary"` full-width. Calls `customerService.updateCustomer(id, payload)`.

**"QUOTE HISTORY" section:**
- Section heading row: `"QUOTE HISTORY"` left (`text-[0.6875rem] font-bold uppercase tracking-widest text-outline`) + `"{n} QUOTES"` count right (same style)
- Quote cards: same structure as Home screen quote cards — `bg-surface-container-lowest rounded-lg p-4 ghost-shadow`. Show: `doc_number` + date, status badge, total amount. Tapping navigates to `/quotes/${quote.id}/preview`.
- The quote card here does NOT show `item_count` (that field is from the list endpoint which returns all quotes; the customer-filtered subset uses the same `QuoteListItem` type which has `item_count` after the home screen task lands — use it if available, make it optional in the card rendering so this task does not hard-depend on the home screen task).
- Empty state when no quotes: `"No quotes yet."` in `text-sm text-outline`

**Bottom nav:** `<BottomNav active="customers" />` — this screen is part of the Customers tab context.

**Step 4 — Register routes in `App.tsx`**

Add three routes inside `<ProtectedRoute>`:
```tsx
<Route path="/customers" element={<CustomerListScreen />} />
<Route path="/customers/new" element={<CustomerCreateScreen />} />
<Route path="/customers/:id" element={<CustomerDetailScreen />} />
```

Important: `/customers/new` must be declared **before** `/customers/:id` to prevent "new" being captured as a customer ID.

**Step 5 — Tests**

**`CustomerListScreen.test.tsx`** (new):
- Renders "Customers" headline
- Renders customer rows from mock data
- Search filters by customer name
- Empty state renders when no customers
- FAB navigates to `/customers/new`
- `BottomNav` renders with `active="customers"`

**`CustomerCreateScreen.test.tsx`** (new):
- Form fields render
- Submitting with empty name shows validation
- Successful create navigates to `/customers/:id`
- Error banner renders on API failure

**`CustomerDetailScreen.test.tsx`** (new):
- Renders customer name in app bar
- Editable fields populated with customer data
- Save Changes calls `updateCustomer` with updated data
- "Create Quote" button navigates to `/quotes/capture/:id`
- Quote history renders filtered quotes
- Quote history empty state renders when no quotes
- `BottomNav` renders with `active="customers"`

---

### Acceptance Criteria

- [ ] `/customers` route renders `CustomerListScreen` — inline "Customers" title, search input, customer rows, FAB, `BottomNav active="customers"`
- [ ] Customer rows show name bold + contact info muted + chevron; tap navigates to `/customers/:id`
- [ ] Search filters customer list by name (case-insensitive, client-side)
- [ ] Empty state renders when customer list is empty
- [ ] FAB navigates to `/customers/new`
- [ ] `/customers/new` route renders `CustomerCreateScreen` — app bar with back arrow, stacked input fields, primary "Create Customer →" button
- [ ] After successful create, user is navigated to `/customers/:id` (detail page, not into quote flow)
- [ ] `/customers/:id` route renders `CustomerDetailScreen` — app bar with customer name, editable info card, "Create Quote" button, quote history section, `BottomNav active="customers"`
- [ ] "Save Changes" calls `customerService.updateCustomer` and shows success/error feedback
- [ ] "Create Quote →" navigates directly to `/quotes/capture/:id` (bypasses CustomerSelectScreen)
- [ ] Quote history shows the customer's quotes filtered from the list; each card taps to QuotePreview
- [ ] `/customers/new` route is declared before `/customers/:id` in `App.tsx` to prevent routing conflict
- [ ] All three new test files pass
- [ ] `make frontend-verify` passes cleanly

---

### Files in Scope

```
frontend/src/features/customers/components/CustomerListScreen.tsx    (new)
frontend/src/features/customers/components/CustomerCreateScreen.tsx  (new)
frontend/src/features/customers/components/CustomerDetailScreen.tsx  (new)
frontend/src/App.tsx                                                  (add 3 routes)
```

Tests to add:
```
frontend/src/features/customers/tests/CustomerListScreen.test.tsx    (new)
frontend/src/features/customers/tests/CustomerCreateScreen.test.tsx  (new)
frontend/src/features/customers/tests/CustomerDetailScreen.test.tsx  (new)
```

---

### Files Explicitly Out of Scope

- All backend files
- `customerService.ts` — no API changes
- `quoteService.ts` — no API changes
- `CustomerSelectScreen.tsx` — untouched (serves the quote creation flow, different UX intent)
- Any existing feature screen

---

### Verification

```bash
make frontend-verify
```

Raw fallback:
```bash
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
