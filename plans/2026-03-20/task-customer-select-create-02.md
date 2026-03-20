# Task: Customer Select / Create (V0 Task 2)

## Goal

Build the customer feature end-to-end: migrate the `customers` table, wire four CRUD
endpoints scoped to the authenticated user, and implement a single screen where the user
can search existing customers or create a new one inline. Selecting or creating a customer
navigates to `/quotes/capture/:customerId`, making `customer_id` available to Task 3B
without any further plumbing.

## Parent Spec / Roadmap Reference

`docs/V0_ROADMAP.md` — Task 2 — Customer Select / Create

---

## Decision Locks (resolved in whiteboard — do not re-open)

| # | Decision | Rationale |
|---|---|---|
| 1 | Pass `customer_id` via URL param: `/quotes/capture/:customerId` | Survives refresh, clean linking. `customer_id` is a UUID reference — not sensitive. Server enforces ownership on every request regardless of what is in the URL. Route state would be lost on page reload. |
| 2 | Client-side search filtering (load all, filter locally) | V0 user base is small; per-user customer lists will be short. Avoids debounce and API complexity. Can be upgraded to server-side search later if lists grow. |
| 3 | Inline create on the same screen as search — not a separate page | Per spec Screen 4 and roadmap. One screen does both. `name` is required; `phone`, `email`, `address` are optional. |
| 4 | Add a minimal "New Quote" button to AppShell (`/`) | Makes the flow reachable and testable end-to-end now. AppShell stays minimal — Task 6 replaces it with the real home screen. |
| 5 | Wire `/quotes/capture/:customerId` to the existing stub `CaptureScreen` | `CaptureScreen` already exists as a stub (`return null`). Wiring the route now means the navigation from Task 2 works and Task 3B simply fills in the component — no App.tsx change required in Task 3B. |
| 6 | `CustomerSelectScreen` manages its own state (no extracted hook) | Component scope is bounded: search input, customer list, inline create form, loading/error. If component approaches 250 LOC, extract to `useCustomerSelect` hook — but do not create the hook pre-emptively. |

---

## Scope

**In:**
- Migration: `customers` table
- `Customer` SQLAlchemy 2.0 model in `customers/models.py`
- `get_customer_service` dependency in `shared/dependencies.py`
- 4 endpoints: `GET /api/customers`, `POST /api/customers`, `GET /api/customers/:id`, `PATCH /api/customers/:id`
- Wire customer router into `main.py`
- `customerService.ts`: `listCustomers`, `createCustomer`, `getCustomer`, `updateCustomer`
- `CustomerSelectScreen` component: search + inline create + select
- Types: `Customer`, `CustomerCreateRequest`, `CustomerUpdateRequest`
- Route: `/quotes/new` → `CustomerSelectScreen`; on select → `/quotes/capture/:customerId`
- Route: `/quotes/capture/:customerId` → existing stub `CaptureScreen`
- AppShell: add "New Quote" button → `/quotes/new`
- MSW handlers: `GET /api/customers`, `POST /api/customers`
- Backend tests: CRUD happy path + auth isolation
- Frontend tests: component tests (`vi.mock`) + MSW integration tests

**Out:**
- Quote capture or review screens (Task 3)
- Customer update UI (Settings-level; Task 7 territory)
- Customer delete
- Pagination (optional for V0; `GET /api/customers` returns full list)
- Any changes to auth, profile, or quote features

---

## File Targets

### Backend

| File | Action | Purpose |
|---|---|---|
| `backend/alembic/versions/<new>.py` | Create | `customers` table migration |
| `backend/app/features/customers/models.py` | Implement (from stub) | `Customer` model — SQLAlchemy 2.0 style |
| `backend/app/features/customers/schemas.py` | Implement (from stub) | `CustomerResponse`, `CustomerCreateRequest`, `CustomerUpdateRequest` |
| `backend/app/features/customers/repository.py` | Implement (from stub) | `list_by_user`, `get_by_id`, `create`, `update` |
| `backend/app/features/customers/service.py` | Implement (from stub) | `CustomerService` — orchestration + ownership enforcement |
| `backend/app/features/customers/api.py` | Implement (from stub) | 4 endpoints with `get_current_user` + `require_csrf` on mutating routes |
| `backend/app/shared/dependencies.py` | Modify | Add `get_customer_service` |
| `backend/app/main.py` | Modify | `app.include_router(customer_router, prefix="/api")` |
| `backend/app/features/customers/tests/test_customers.py` | Implement (from stub) | CRUD happy path + auth isolation |

`registry.py` already imports `customer_models` — no change needed.

### Frontend

| File | Action | Purpose |
|---|---|---|
| `frontend/src/features/customers/types/customer.types.ts` | Create | `Customer`, `CustomerCreateRequest`, `CustomerUpdateRequest` |
| `frontend/src/features/customers/services/customerService.ts` | Create | `listCustomers`, `createCustomer`, `getCustomer`, `updateCustomer` |
| `frontend/src/features/customers/components/CustomerSelectScreen.tsx` | Create | Search + inline create + select flow |
| `frontend/src/features/customers/tests/CustomerSelectScreen.test.tsx` | Create | Component tests (`vi.mock` on customerService) |
| `frontend/src/features/customers/tests/customerService.integration.test.ts` | Create | MSW integration tests |
| `frontend/src/app/App.tsx` | Modify | Add `/quotes/new`, `/quotes/capture/:customerId` routes; add "New Quote" button to AppShell |
| `frontend/src/shared/tests/mocks/handlers.ts` | Modify | Add `GET /api/customers`, `POST /api/customers` handlers |

---

## Backend Architecture Detail

### Migration

Generate via alembic autogenerate after adding the model.
Do not modify any existing migration.

```python
# customers table
id: UUID PK
user_id: UUID FK → users (indexed, cascade delete)
name: VARCHAR(255) NOT NULL
phone: VARCHAR(30) NULL
email: VARCHAR(320) NULL
address: TEXT NULL
created_at: TIMESTAMPTZ server default
updated_at: TIMESTAMPTZ server default + onupdate
```

### `Customer` model (`customers/models.py`)

```python
class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(sa.String(255))
    phone: Mapped[str | None] = mapped_column(sa.String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(sa.String(320), nullable=True)
    address: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), server_default=sa.func.now())
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now())
```

### Schemas (`customers/schemas.py`)

```python
class CustomerCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=320)
    address: str | None = None

class CustomerUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = None
    email: str | None = None
    address: str | None = None

class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    phone: str | None
    email: str | None
    address: str | None
    created_at: datetime
    updated_at: datetime
```

### Repository (`customers/repository.py`)

```
list_by_user(session, user_id) -> list[Customer]
get_by_id(session, customer_id, user_id) -> Customer | None   # scoped: user_id guard
create(session, user_id, name, phone, email, address) -> Customer
update(session, customer, **fields) -> Customer
```

`get_by_id` filters on both `id` AND `user_id`. Never look up by `id` alone.

### Service (`customers/service.py`)

```
class CustomerServiceError(Exception):
    def __init__(self, status_code: int, detail: str): ...

class CustomerService:
    async def list_customers(user: User) -> list[Customer]
    async def get_customer(user: User, customer_id: UUID) -> Customer   # raises 404 if not found/owned
    async def create_customer(user: User, data: CustomerCreateRequest) -> Customer
    async def update_customer(user: User, customer_id: UUID, data: CustomerUpdateRequest) -> Customer
```

Ownership is enforced by the repository's `user_id` guard — the service raises `CustomerServiceError(404, "Not found")` when the repository returns `None`. Never leak 403 (would confirm the resource exists).

### API (`customers/api.py`)

```
GET  /api/customers          — Depends(get_current_user) — returns list[CustomerResponse]
POST /api/customers          — Depends(get_current_user), Depends(require_csrf) — 201 CustomerResponse
GET  /api/customers/{id}     — Depends(get_current_user) — returns CustomerResponse
PATCH /api/customers/{id}    — Depends(get_current_user), Depends(require_csrf) — returns CustomerResponse
```

Return `201` on `POST`, `200` on `GET`/`PATCH`. Map `CustomerServiceError` to HTTPException.

### `get_customer_service` in `dependencies.py`

Follow the same pattern as `get_profile_service`:
```python
def get_customer_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CustomerService:
    return CustomerService(CustomerRepository(db))
```

---

## Frontend Architecture Detail

### Types (`customer.types.ts`)

```typescript
export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerCreateRequest {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface CustomerUpdateRequest {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
}
```

### `customerService.ts`

Follow the pattern in `profileService.ts`:
```typescript
export const customerService = {
  listCustomers: () => request<Customer[]>('/api/customers'),
  createCustomer: (data: CustomerCreateRequest) =>
    request<Customer>('/api/customers', { method: 'POST', body: data }),
  getCustomer: (id: string) => request<Customer>(`/api/customers/${id}`),
  updateCustomer: (id: string, data: CustomerUpdateRequest) =>
    request<Customer>(`/api/customers/${id}`, { method: 'PATCH', body: data }),
};
```

### `CustomerSelectScreen` component

Two modes, one screen:

**Search mode (default):**
- Load all customers on mount via `customerService.listCustomers()`
- Text input filters the list client-side: `name.toLowerCase().includes(query.toLowerCase())`
- Each result row shows `name` + optional `phone`/`email` as subtitle
- Tap a row → `navigate('/quotes/capture/:customerId')`
- "Add new customer" button below the list (or empty state) → switches to create mode

**Create mode:**
- Form fields: `name` (required), `phone` (optional), `email` (optional), `address` (optional)
- Submit calls `customerService.createCustomer(data)`
- On success: immediately select the new customer → `navigate('/quotes/capture/:newCustomerId')`
- Error state: show inline error, stay on form
- "Cancel" → return to search mode

State shape (internal to component, no hook extraction unless LOC approaches 250):
```typescript
const [customers, setCustomers] = useState<Customer[]>([]);
const [query, setQuery] = useState('');
const [mode, setMode] = useState<'search' | 'create'>('search');
const [loading, setLoading] = useState(true);
const [createError, setCreateError] = useState<string | null>(null);
```

### Route changes in `App.tsx`

New routes inside `<Route element={<ProtectedRoute />}>`:
```
/quotes/new                  → CustomerSelectScreen
/quotes/capture/:customerId  → CaptureScreen (existing stub)
```

`AppShell` modification — add a "New Quote" button:
```tsx
<button onClick={() => navigate('/quotes/new')}>New Quote</button>
```

No other changes to `App.tsx` route structure.

### MSW handlers (`handlers.ts`)

```typescript
http.get('/api/customers', () =>
  HttpResponse.json([
    { id: 'cust-1', name: 'Alice Johnson', phone: '555-0101', email: null, address: null, ... },
  ])
),

http.post('/api/customers', ({ request }) => {
  // Return 403 if X-CSRF-Token missing (enforce CSRF contract)
  if (!request.headers.get('X-CSRF-Token')) {
    return HttpResponse.json({ detail: 'CSRF token missing' }, { status: 403 });
  }
  return HttpResponse.json({ id: 'cust-new', name: 'New Customer', ... }, { status: 201 });
}),
```

---

## Test Cases

### Backend (`backend/app/features/customers/tests/test_customers.py`)

Follow the pattern from `auth/tests/test_auth_api.py` and `profile/tests/test_profile.py`.

**Happy path:**
1. `GET /api/customers` — authenticated, no customers → 200, empty list
2. `POST /api/customers` — name only → 201, customer returned
3. `POST /api/customers` — all fields → 201, all fields in response
4. `GET /api/customers` after creating two → 200, both returned
5. `GET /api/customers/:id` — own customer → 200
6. `PATCH /api/customers/:id` — update name → 200, updated name returned

**Auth and scoping:**
7. `GET /api/customers` — unauthenticated → 401
8. `POST /api/customers` — unauthenticated → 401
9. `POST /api/customers` — missing CSRF → 403
10. `PATCH /api/customers/:id` — missing CSRF → 403
11. `GET /api/customers/:id` — customer belonging to a different user → 404 (not 403)
12. `PATCH /api/customers/:id` — customer belonging to a different user → 404

**Validation:**
13. `POST /api/customers` — missing `name` → 422
14. `POST /api/customers` — empty string `name` → 422

### Frontend — `CustomerSelectScreen.test.tsx` (component, `vi.mock` on customerService)

1. Renders search input and loading state on mount
2. Renders customer list after load resolves
3. Filters list when user types in the search input
4. Empty query shows all customers
5. Tap a customer row navigates to `/quotes/capture/:customerId`
6. "Add new customer" button switches to create mode
7. Create form renders name (required), phone, email, address fields
8. Create form submit calls `customerService.createCustomer` with correct payload
9. On successful create, navigates to `/quotes/capture/:newCustomerId`
10. Create form shows error message if `createCustomer` rejects
11. "Cancel" on create form returns to search mode

### Frontend — `customerService.integration.test.ts` (MSW)

1. `listCustomers()` — 200 → returns parsed `Customer[]`
2. `createCustomer(data)` — 201 → returns created `Customer`; CSRF header sent
3. `createCustomer(data)` — no CSRF token set → MSW returns 403 → error propagates
4. `getCustomer(id)` — 200 → returns `Customer`

---

## Implementation Notes

- **Migration generation**: add `Customer` model first, then `alembic revision --autogenerate -m "add_customers_table"`. Verify generated SQL before applying. `registry.py` already imports the module — autogenerate will pick it up.
- **Ownership returns 404, not 403**: returning 403 confirms the resource exists under a different owner. The spec says "user A cannot see user B's customers" — 404 is correct and already common in the auth patterns.
- **`PATCH` partial update**: `CustomerUpdateRequest` has all optional fields. The repository's `update` method should only set fields that are explicitly provided (not `None`). Use `model.model_dump(exclude_unset=True)` to get only submitted fields.
- **`CaptureScreen` is currently `return null`**: that's fine. Wiring `/quotes/capture/:customerId` to it now means the navigation works. Task 3B fills in the component — no App.tsx change needed in that task.
- **`AppShell` button**: keep it minimal — a plain `<button>` or `<Link>` with "New Quote" text. Task 6 replaces AppShell with the real home screen. Do not invest UI effort here.
- **No `GET /api/customers/:id` MSW handler needed for Task 2**: the frontend flow doesn't call `getCustomer` in the select/create screen. Add it to handlers when Task 3 needs it.
- **Test fixture user setup**: backend tests need two distinct users to test isolation. Create user A and user B in the test setup, authenticate separately, assert cross-user endpoints return 404.

---

## Acceptance Criteria

- [ ] `customers` table migrated; `alembic upgrade head` clean
- [ ] `GET /api/customers` returns only the authenticated user's customers
- [ ] `POST /api/customers` creates a customer with `name` required; `phone`/`email`/`address` optional
- [ ] `GET /api/customers/:id` returns 404 (not 403) for another user's customer
- [ ] `PATCH /api/customers/:id` returns 404 (not 403) for another user's customer
- [ ] All mutating endpoints enforce CSRF (`require_csrf` dependency)
- [ ] Customer router wired into `main.py` under `/api` prefix
- [ ] `CustomerSelectScreen` renders, searches, and creates customers
- [ ] Selecting a customer navigates to `/quotes/capture/:customerId`
- [ ] Creating a customer auto-selects it and navigates to `/quotes/capture/:newCustomerId`
- [ ] AppShell has a "New Quote" button linking to `/quotes/new`
- [ ] All new backend tests pass: `make backend-verify`
- [ ] All new frontend tests pass: `make frontend-verify`
- [ ] Existing test suite unbroken

## Verification

```bash
make backend-verify
make frontend-verify
```

Raw fallback:
```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```

## PR Checklist

- [ ] PR references this issue (`Closes #<id>`)
- [ ] Branch: `task-<id>-customer-select-create`
- [ ] `docs/ARCHITECTURE.md` updated: `customers` schema table added, customer endpoints added to API contracts section
- [ ] Ownership returns 404 not 403 — confirmed in tests
- [ ] `registry.py` not modified (already imports `customer_models`)
- [ ] No new frontend hook extracted unless `CustomerSelectScreen` approaches 250 LOC
