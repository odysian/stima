# Task: Settings Screen (V0 Task 7)

## Goal

Replace the `/settings` placeholder div with a real settings screen. A contractor
can update their business profile (business name, owner name, trade type) and sign
out from a single screen. No new backend work — `PATCH /api/profile` was built in
Task 1 and is already tested end-to-end.

## Parent Roadmap Reference

`docs/V0_ROADMAP.md` § Task 7 — Settings Screen

---

## Locked Design Decisions

### Frontend-only task — no backend changes

`GET /api/profile` and `PATCH /api/profile` are fully wired with auth and CSRF.
`ProfileResponse` already includes every field the settings screen needs. No new
endpoints, no new migrations, no new backend schemas. If a field turns out to be
genuinely missing, that is a blocker to surface before implementation begins — but
based on the current schema it is not expected.

### `features/settings/` as the feature home

The settings screen lives in `frontend/src/features/settings/`. It imports the
service and types from `features/profile/` (no duplication) but the component and
its tests belong to the settings feature. This keeps the screen in its natural
nav-level home and avoids growing the profile feature into a catch-all.

### Two sections, one form submit

The screen has two visually distinct sections:
1. **Business profile** — business name, first name, last name, trade type.
   Pre-filled from `GET /api/profile` on mount. Submits to `PATCH /api/profile`.
2. **Account** — email displayed read-only (no edit). Sign Out button.

Both sections are on the same route. There is no tab navigation or separate page.

### Post-save: stay on settings with inline feedback

After a successful `PATCH /api/profile`, the screen stays at `/settings` and shows
an inline success message (e.g. "Saved"). No redirect. This is the standard
edit-in-place pattern; the onboarding redirect is a one-time flow, not a settings
UX model.

### `refreshUser()` called after successful PATCH

`useAuth().refreshUser()` is called after a successful profile update to keep the
auth context current. The auth context does not currently expose `business_name` but
calling `refreshUser()` is cheap, consistent with the onboarding form, and future-
proofs any auth context expansion.

### Sign out: call `logout()` from `useAuth`, no custom redirect logic

`useAuth().logout()` calls `authService.logout()` and sets `user = null`. The
existing `ProtectedRoute` guard handles the redirect to `/login` automatically.
No additional navigation logic needed in `SettingsScreen`.

### Load profile on mount, no global state

`SettingsScreen` fetches the profile via `profileService.getProfile()` on mount
to pre-fill the form. No shared profile state, no context propagation. The profile
is loaded fresh each time the screen mounts.

### Initial load: dedicated loading state, form rendered only after fetch settles

While the profile fetch is in-flight, render a loading indicator only — do not
render the form at all. Once the fetch resolves, render either the pre-filled form
(success) or an error message (failure). Do not render a blank/disabled form during
load; a blank form looks like loaded-but-empty data and conflicts with the error
state requirement.

### Null field normalization before binding to form state

`ProfileResponse` allows `first_name`, `last_name`, `business_name`, and
`trade_type` to be `null` (the user may have been onboarded via an older path).
The shared `Input` component requires `value: string`. Normalize on fetch resolve:
- Text fields (`business_name`, `first_name`, `last_name`): `null → ""`
- `trade_type`: `null → TRADE_TYPES[0]` (the default, `"Landscaping"`)

This normalization must be explicit in the component and covered by a dedicated test
case: a profile with all nullable fields set to `null` must render a valid, fully
controlled form with no React controlled/uncontrolled warnings.

---

## Considerations / Follow-Ups

- **Trade type list is currently two values** (`Landscaping`, `Power Washing`).
  `TRADE_TYPES` in `profile.types.ts` is the source of truth. Do not duplicate the
  list in the settings component.
- **Loading state on mount:** The form is not rendered until the profile fetch
  settles. See locked decision above.
- **`owner_name` vs. `first_name`/`last_name`:** The roadmap calls the field
  "Owner name" but the API schema uses `first_name` + `last_name` (two fields).
  The settings form should follow the onboarding form and expose both fields
  separately, matching `ProfileUpdateRequest`.
- **Email read-only:** Email is not editable in V0. Render it as a text display
  element, not a disabled input, to avoid confusion about why it cannot be changed.
- **Logo upload:** Explicitly deferred per spec. Do not stub or mention it.

---

## Scope

### New files

**`frontend/src/features/settings/components/SettingsScreen.tsx`**
- Fetches profile on mount via `profileService.getProfile()`; shows loading state
  during fetch; shows error state if fetch fails
- Business profile section: business name, first name, last name, trade type —
  all pre-filled from the fetched profile
- On submit: calls `profileService.updateProfile(...)`, then `refreshUser()`;
  shows inline success message on success; shows inline error message on failure;
  submit button disabled while request is in-flight
- Account section: email displayed as read-only text; Sign Out button calls
  `useAuth().logout()`
- Reuse shared `Input` and `Button` components for visual consistency

**`frontend/src/features/settings/tests/SettingsScreen.test.tsx`**
- Uses `vi.mock` on `profileService` and `useAuth` (component test layer, no MSW)
- Renders pre-filled form fields from mocked `getProfile` response
- Null profile fields (`first_name: null`, etc.) render as empty string inputs
  with no React controlled/uncontrolled warning; `trade_type: null` falls back
  to `TRADE_TYPES[0]`
- Submit calls `updateProfile` with correct payload, then `refreshUser`
- Shows inline success message after successful save
- Shows inline error message when `updateProfile` rejects
- Submit button disabled while request is in-flight
- Sign Out button calls `logout()`
- Shows loading state (not the form) while profile fetch is in-flight
- Shows error state if profile fetch fails (form not rendered)

### Modified files

**`frontend/src/App.tsx`**
- Replace the placeholder div at `/settings` with `<SettingsScreen />` inside
  `ProtectedRoute`
- Add the import

**`frontend/src/features/auth/tests/App.routes.test.tsx`** (extend)
- Add one assertion: an onboarded authenticated user navigating to `/settings`
  renders `SettingsScreen` content, not the placeholder div. This locks route
  wiring so the acceptance criterion "`/settings` renders `SettingsScreen`" is
  actually verified at the routing level, not just at the component level.

**`docs/ARCHITECTURE.md`** (extend)
- Add `features/settings/` to the frontend layout section so the feature
  structure remains accurate after the new module lands.

The existing MSW profile handlers
(`GET /api/profile`, `PATCH /api/profile`) are sufficient; no new handlers needed.
The profile service and types are unchanged.

---

## File Targets

| File | Action | Purpose |
|---|---|---|
| `frontend/src/features/settings/components/SettingsScreen.tsx` | Create | Settings screen component |
| `frontend/src/features/settings/tests/SettingsScreen.test.tsx` | Create | Component tests |
| `frontend/src/App.tsx` | Modify | Wire `/settings` route |
| `frontend/src/features/auth/tests/App.routes.test.tsx` | Modify | Add `/settings` route-wiring assertion |
| `docs/ARCHITECTURE.md` | Modify | Add `features/settings/` to frontend layout section |

---

## Acceptance Criteria

- [ ] `/settings` renders `SettingsScreen` (not the placeholder div)
- [ ] Screen shows a loading state while the profile fetch is in-flight
- [ ] Screen shows an error state if the profile fetch fails (not a blank form)
- [ ] Business profile fields are pre-filled from `GET /api/profile`
- [ ] Submitting calls `PATCH /api/profile` with all four fields
- [ ] `refreshUser()` is called after a successful PATCH
- [ ] Inline success feedback is shown after save; screen stays at `/settings`
- [ ] Inline error feedback is shown when PATCH fails
- [ ] Submit button is disabled while the PATCH request is in-flight
- [ ] Email is displayed read-only (not an editable input)
- [ ] Sign Out button calls `logout()` and session clears (redirect handled by `ProtectedRoute`)
- [ ] Null profile fields are normalized to `""` (text) and `TRADE_TYPES[0]`
      (trade type) before binding to form state; covered by a dedicated test case
- [ ] All component tests pass: pre-fill, null normalization, submit happy path,
      submit error, in-flight disabled state, sign-out, load state, fetch error state
- [ ] `App.routes.test.tsx` asserts `/settings` renders `SettingsScreen` for an
      onboarded user
- [ ] `docs/ARCHITECTURE.md` frontend layout section updated to include
      `features/settings/`
- [ ] `make frontend-verify` passes

## DoD gate

A logged-in user can navigate to `/settings`, update their business profile, see
confirmation inline, and sign out — all without a page refresh or redirect after save.

---

## Verification

```bash
make frontend-verify
```

Fallback:
```bash
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
