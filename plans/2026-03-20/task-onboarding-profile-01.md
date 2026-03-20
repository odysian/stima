# Task: Onboarding + Profile (V0 Task 1)

## Goal

Wire the onboarding flow and profile API so a registered user can complete a one-time
business profile (business name, owner first/last name, trade type) and land on the
main app shell. The `is_onboarded` flag gates access to the rest of the app on both
backend and frontend.

## Parent Spec / Roadmap reference

`docs/V0_ROADMAP.md` — Task 1 — Onboarding + Profile

---

## Decision Locks (resolved in whiteboard — do not re-open)

| # | Decision | Rationale |
|---|---|---|
| 1 | `is_onboarded` exposed on `/me` response (not a separate profile call) | No security concern — boolean doesn't disclose sensitive data; computed server-side so unforgeable. Frontend gating is UX-only; backend enforces auth on all real endpoints. Avoids a second round-trip on bootstrap. |
| 2 | Use existing `first_name` / `last_name` columns for owner name — no `owner_name` column | `users` table already has these nullable columns from auth scaffold. Avoids redundant column. Migration adds only `business_name` and `trade_type`. |
| 3 | Trade type as enumerated list (backend `str` enum, frontend `as const`) | Landscaping and Power Washing for V0. Enumerated so additions require only one change per side — no DB schema change. |
| 4 | `OnboardingForm` component lives in `features/profile/` | Onboarding is the first write to profile data; Task 7 Settings will be the second. Shared `profileService` reused both times. No separate `features/onboarding/` directory. |
| 5 | `PATCH /api/profile` accepts all four fields: `business_name`, `first_name`, `last_name`, `trade_type` | Covers both onboarding (Task 1) and Settings (Task 7) reuse without a second endpoint. All four required by app logic on the onboarding path. |
| 6 | `OnboardingRoute` guard added alongside `ProtectedRoute` in `App.tsx` | Two distinct guards: `ProtectedRoute` (authenticated + onboarded → main app), `OnboardingRoute` (authenticated + not onboarded → onboarding form). Keeps guard logic explicit and testable. |

---

## Scope

**In:**
- Migration: add `business_name VARCHAR(255)` and `trade_type VARCHAR(50)` to `users` (nullable in DB)
- `User` model: add two new `Mapped[str | None]` columns + `is_onboarded` computed property
- `AuthUserResponse` schema: add `is_onboarded: bool`; update `_serialize_user` in `auth/api.py`
- `profile/` feature: implement all four stub modules (`schemas`, `repository`, `service`, `api`)
- Wire profile router into `main.py`
- Frontend `User` type: add `is_onboarded: boolean`
- `useAuth`: expose `isOnboarded: boolean` derived from `user?.is_onboarded ?? false`
- `App.tsx`: add `OnboardingRoute` guard; update `ProtectedRoute` to redirect to `/onboarding` when not onboarded; wire `OnboardingForm`
- `features/profile/` frontend: create types, service, `OnboardingForm` component, and tests
- MSW handlers: update `/api/auth/me` to include `is_onboarded`; add `GET /api/profile` and `PATCH /api/profile` handlers

**Out:**
- Settings screen (Task 7 owns the settings UI that reuses `PATCH /api/profile`)
- `first_name` / `last_name` columns — already exist, do not modify the column definition
- `phone_number` column — leave as-is, not part of onboarding
- Logo upload — deferred per roadmap
- Any quote, customer, or extraction code

---

## File Targets

### Backend

| File | Action | Purpose |
|---|---|---|
| `backend/alembic/versions/<new>.py` | Create | Add `business_name`, `trade_type` columns to `users` |
| `backend/app/features/auth/models.py` | Modify | Add `business_name`, `trade_type` columns + `is_onboarded` property |
| `backend/app/features/auth/schemas.py` | Modify | Add `is_onboarded: bool` to `AuthUserResponse` |
| `backend/app/features/auth/api.py` | Modify | Update `_serialize_user` to include `is_onboarded` |
| `backend/app/features/profile/schemas.py` | Implement (from stub) | `ProfileResponse`, `ProfileUpdateRequest`, `TradeType` enum |
| `backend/app/features/profile/repository.py` | Implement (from stub) | `get_user_by_id`, `update_user_fields` |
| `backend/app/features/profile/service.py` | Implement (from stub) | `get_profile`, `update_profile` (validates all four non-empty) |
| `backend/app/features/profile/api.py` | Implement (from stub) | `GET /api/profile`, `PATCH /api/profile` |
| `backend/app/main.py` | Modify | `app.include_router(profile_router, prefix="/api")` |
| `backend/app/features/profile/tests/test_profile.py` | Create | Profile API tests (see test cases below) |

Note: `features/registry.py` does **not** need updating — profile uses the `User` model from
`auth/models.py`, not a new model.

### Frontend

| File | Action | Purpose |
|---|---|---|
| `frontend/src/features/auth/types/auth.types.ts` | Modify | Add `is_onboarded: boolean` to `User` |
| `frontend/src/features/auth/hooks/useAuth.ts` | Modify | Expose `isOnboarded: boolean` in context value |
| `frontend/src/features/profile/types/profile.types.ts` | Create | `ProfileResponse`, `ProfileUpdateRequest`, `TRADE_TYPES` const |
| `frontend/src/features/profile/services/profileService.ts` | Create | `getProfile()`, `updateProfile(data)` |
| `frontend/src/features/profile/components/OnboardingForm.tsx` | Create | Four-field form: business name, first name, last name, trade type |
| `frontend/src/features/profile/tests/OnboardingForm.test.tsx` | Create | Component tests (vi.mock on profileService) |
| `frontend/src/features/profile/tests/profileService.integration.test.ts` | Create | MSW integration tests for GET/PATCH profile |
| `frontend/src/App.tsx` | Modify | Add `OnboardingRoute`; update `ProtectedRoute`; wire `OnboardingForm` |
| `frontend/src/features/auth/tests/App.routes.test.tsx` | Modify | Update `/me` mock to include `is_onboarded`; add onboarding redirect tests |
| `frontend/src/shared/tests/mocks/handlers.ts` | Modify | Update `GET /api/auth/me`; add `GET /api/profile`, `PATCH /api/profile` |

---

## Backend Architecture Detail

### Migration

Generate via alembic autogenerate after adding columns to the model.
Do not modify `20260318_0001_auth_foundation.py`.

```python
# New columns on users table (nullable in DB, enforced non-null by app logic)
business_name: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
trade_type: Mapped[str | None] = mapped_column(sa.String(50), nullable=True)
```

### `is_onboarded` property on `User`

```python
@property
def is_onboarded(self) -> bool:
    return bool(self.business_name and self.first_name and self.last_name and self.trade_type)
```

Depends on all four fields being non-null and non-empty.

### `TradeType` enum (profile/schemas.py)

```python
class TradeType(str, enum.Enum):
    LANDSCAPING = "Landscaping"
    POWER_WASHING = "Power Washing"
```

Use `str` enum so Pydantic serializes it as a plain string in JSON.

### `ProfileUpdateRequest` validation

All four fields are required on the request body (`business_name`, `first_name`, `last_name`,
`trade_type`). Use `Field(min_length=1)` on each to reject empty strings.

### `profile/service.py`

```
get_profile(user: User) -> User          # pass-through to repository; returns full User
update_profile(user: User, *, business_name, first_name, last_name, trade_type) -> User
```

`update_profile` is responsible for calling `repository.update_user_fields` and committing.
The route layer should not call `commit()` directly.

### `profile/api.py`

```
GET  /api/profile   — Depends(get_current_user) — returns ProfileResponse
PATCH /api/profile  — Depends(get_current_user), Depends(require_csrf) — returns ProfileResponse
```

Both endpoints are under prefix `/api` (profile router uses `prefix="/profile"`).

### `AuthUserResponse` change

Add `is_onboarded: bool` field. This is a **new field addition** — not a breaking change.
Existing consumers that don't use `is_onboarded` are unaffected.

Update `_serialize_user` in `auth/api.py`:
```python
def _serialize_user(user: User) -> AuthUserResponse:
    return AuthUserResponse(
        id=user.id,
        email=user.email,
        is_active=user.is_active,
        is_onboarded=user.is_onboarded,
    )
```

---

## Frontend Architecture Detail

### `useAuth` context extension

```typescript
interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isOnboarded: boolean;   // <-- new
  login: ...
  register: ...
  logout: ...
}
```

`isOnboarded` derived in context value: `user?.is_onboarded ?? false`.

### Route guard logic (`App.tsx`)

```
ProtectedRoute:
  - no user → /login
  - user && !is_onboarded → /onboarding
  - else → <Outlet />

OnboardingRoute:
  - no user → /login
  - user && is_onboarded → /
  - else → <Outlet />  (render onboarding form)
```

`PublicRoute` stays unchanged (redirects any authenticated user to `/`).

Route tree:
```
/login         → PublicRoute → LoginForm
/register      → PublicRoute → RegisterForm
/onboarding    → OnboardingRoute → OnboardingForm
/              → ProtectedRoute → AppShell
/onboarding    must NOT be inside ProtectedRoute
```

### `OnboardingForm` component

- Fields: Business name (text), First name (text), Last name (text), Trade type (select)
- Select options: `["Landscaping", "Power Washing"]` — sourced from `TRADE_TYPES` const
- Default selected: `"Landscaping"`
- On submit: calls `profileService.updateProfile(data)`, then navigates to `/`
- Loading state during submit (disable button)
- Error state if API call fails (show error message, do not navigate)

### `profileService.ts`

```typescript
export const profileService = {
  getProfile: () => request<ProfileResponse>('GET', '/api/profile'),
  updateProfile: (data: ProfileUpdateRequest) =>
    request<ProfileResponse>('PATCH', '/api/profile', { body: data }),
}
```

### MSW handler updates

Update the existing `GET /api/auth/me` default handler to include `is_onboarded: true`
(default to onboarded so existing tests that don't test the onboarding flow aren't affected).

Add:
```
GET  /api/profile   → 200 { business_name, first_name, last_name, trade_type, ... }
PATCH /api/profile  → validates X-CSRF-Token (403 if missing); 200 with updated profile
```

### `TRADE_TYPES` const (profile.types.ts)

```typescript
export const TRADE_TYPES = ["Landscaping", "Power Washing"] as const;
export type TradeType = (typeof TRADE_TYPES)[number];
```

---

## Test Cases

### Backend (`backend/app/features/profile/tests/test_profile.py`)

Follow the pattern from `auth/tests/test_auth_api.py`.

1. `GET /api/profile` — authenticated, not yet onboarded → 200, all business fields null
2. `GET /api/profile` — unauthenticated → 401
3. `PATCH /api/profile` — happy path (all four fields) → 200, `is_onboarded` true in response
4. `PATCH /api/profile` — missing `business_name` → 422
5. `PATCH /api/profile` — empty string `first_name` → 422
6. `PATCH /api/profile` — unauthenticated → 401
7. `PATCH /api/profile` — missing CSRF header → 403
8. `GET /api/auth/me` after successful PATCH → `is_onboarded: true`

### Frontend — `OnboardingForm.test.tsx` (component, `vi.mock` on profileService)

1. Renders four fields: business name, first name, last name, trade type select
2. Trade type select contains "Landscaping" and "Power Washing" options
3. Default selected trade type is "Landscaping"
4. Submit calls `profileService.updateProfile` with correct payload
5. Navigates to `/` on successful submit
6. Shows error message if `updateProfile` rejects
7. Submit button is disabled while submit is in-flight

### Frontend — `profileService.integration.test.ts` (MSW)

1. `getProfile()` — 200 → returns parsed `ProfileResponse`
2. `updateProfile(data)` — 200 → returns updated profile; CSRF header sent
3. `updateProfile(data)` — no CSRF token → MSW returns 403 → error propagates

### Frontend — `App.routes.test.tsx` (extend existing)

Update all existing test cases: change `me` mock to include `is_onboarded: true` so
existing auth route tests continue to pass unmodified.

Add:
1. Authenticated user with `is_onboarded: false` at `/` → redirected to `/onboarding`
2. Authenticated user with `is_onboarded: true` at `/onboarding` → redirected to `/`
3. Unauthenticated user at `/onboarding` → redirected to `/login`

---

## Implementation Notes

- **Migration generation**: add both columns to `User` model first, then run
  `alembic revision --autogenerate -m "add_business_fields_to_users"`. Verify the
  generated migration looks correct before applying.
- **`is_onboarded` is a Python property, not a DB column.** SQLAlchemy will not
  map or persist it. No `mapped_column` on it.
- **`update_profile` in service**: repository `update_user_fields` should do a
  `scalar()` to get the updated user back, or re-fetch. The service should return
  the updated `User` so the API can serialize `is_onboarded` from the fresh object.
- **`AuthUserResponse.is_onboarded` type**: Pydantic can call the Python property
  directly if `from_attributes=True` is set on the model config. Confirm the existing
  `model_config` on auth schemas handles this, or add it.
- **Auth test suite**: `GET /api/auth/me` tests in `test_auth_api.py` will need updating
  to assert `is_onboarded` is present in the response (and is `False` for a freshly
  registered user with no business fields).
- **MSW `is_onboarded` default**: set to `true` in base handlers so all existing tests
  that render routes (App.routes.test.tsx) that pass through `ProtectedRoute` still work
  without modification. Only the new onboarding redirect tests should override to `false`.
- **`OnboardingRoute` in App.tsx**: `/onboarding` must NOT be nested inside
  `ProtectedRoute` — it is its own sibling route with its own guard.
- **No `registry.py` update needed**: profile feature reuses the `User` model from auth;
  no new SQLAlchemy model is introduced.

---

## Acceptance Criteria

- [ ] Migration adds `business_name` and `trade_type` columns; `alembic upgrade head` clean
- [ ] `User.is_onboarded` property returns `True` iff all four fields are non-null/non-empty
- [ ] `GET /api/auth/me` includes `is_onboarded: bool`
- [ ] `GET /api/profile` returns full profile; requires auth
- [ ] `PATCH /api/profile` updates all four fields; requires auth + CSRF; validates non-empty
- [ ] Profile router wired into `main.py` under `/api` prefix
- [ ] `OnboardingForm` renders four fields with correct defaults and trade type options
- [ ] Submit calls `profileService.updateProfile`, navigates to `/` on success
- [ ] `ProtectedRoute` redirects authenticated-not-onboarded users to `/onboarding`
- [ ] `OnboardingRoute` redirects authenticated-onboarded users to `/`
- [ ] All new backend tests pass: `cd backend && pytest`
- [ ] All new frontend tests pass: `cd frontend && npx vitest run`
- [ ] Existing auth test suite unbroken (including `App.routes.test.tsx` with `is_onboarded` update)
- [ ] Full verification clean

## Verification

```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```

## PR Checklist

- [ ] PR references this issue (`Closes #<id>`)
- [ ] Branch: `task-<id>-onboarding-profile`
- [ ] `docs/ARCHITECTURE.md` updated: `users` schema table updated with new columns, profile endpoints added to API contracts table
- [ ] No `owner_name` column introduced (use `first_name`/`last_name`)
- [ ] No new SQLAlchemy model (profile reuses `User`)
- [ ] `registry.py` not modified
