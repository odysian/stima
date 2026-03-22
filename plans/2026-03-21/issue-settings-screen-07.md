## Summary

Replace the `/settings` placeholder div with a real settings screen. A contractor can update their business profile and sign out from a single screen. This is a frontend-only task — `PATCH /api/profile` was built in Task 1 and is already tested end-to-end.

**Plan reference:** `plans/2026-03-21/task-settings-screen-07.md`
**Roadmap reference:** `docs/V0_ROADMAP.md` § Task 7 — Settings Screen

---

## Decision Locks

### Frontend-only — no backend changes
`GET /api/profile` and `PATCH /api/profile` are fully wired with auth and CSRF. `ProfileResponse` includes every field the settings screen needs. No new endpoints, migrations, or backend schemas.

### `features/settings/` as the feature home
The component and its tests live in `frontend/src/features/settings/`. Service and types are imported from `features/profile/` — no duplication.

### Two sections, one form submit
1. **Business profile** — business name, first name, last name, trade type. Pre-filled from `GET /api/profile` on mount. Submits to `PATCH /api/profile`.
2. **Account** — email displayed read-only. Sign Out button.

### Initial load contract: loading state first, form only after fetch settles
While the fetch is in-flight, render a loading indicator only — not the form. Once resolved, render either the pre-filled form (success) or an error message (failure). A blank disabled form during load is not acceptable.

### Null field normalization before binding to form state
`ProfileResponse` allows nullable fields. Normalize on fetch resolve before binding to controlled inputs:
- Text fields (`business_name`, `first_name`, `last_name`): `null → ""`
- `trade_type`: `null → TRADE_TYPES[0]` (`"Landscaping"`)

### Post-save: stay on settings with inline success feedback
After a successful `PATCH /api/profile`, the screen stays at `/settings` and shows an inline success message. No redirect.

### `refreshUser()` called after successful PATCH
Keeps the auth context current. Consistent with the onboarding form.

### Sign out: call `logout()` from `useAuth`, no custom redirect logic
`ProtectedRoute` handles the redirect to `/login` automatically when `user` becomes `null`.

---

## Scope

### New files
- `frontend/src/features/settings/components/SettingsScreen.tsx` — settings screen component
- `frontend/src/features/settings/tests/SettingsScreen.test.tsx` — component tests

### Modified files
- `frontend/src/App.tsx` — replace placeholder div at `/settings` with `<SettingsScreen />`
- `frontend/src/features/auth/tests/App.routes.test.tsx` — add `/settings` route-wiring assertion
- `docs/ARCHITECTURE.md` — add `features/settings/` to frontend layout section

No new MSW handlers needed. Profile service and types are unchanged.

---

## Acceptance Criteria

- [ ] `/settings` renders `SettingsScreen` (not the placeholder div)
- [ ] Screen shows a loading state (not the form) while the profile fetch is in-flight
- [ ] Screen shows an error state if the profile fetch fails (form not rendered)
- [ ] Business profile fields are pre-filled from `GET /api/profile`
- [ ] Null profile fields are normalized: text fields `→ ""`, `trade_type` `→ TRADE_TYPES[0]`; covered by a dedicated test case
- [ ] Submitting calls `PATCH /api/profile` with all four fields
- [ ] `refreshUser()` is called after a successful PATCH
- [ ] Inline success feedback is shown after save; screen stays at `/settings`
- [ ] Inline error feedback is shown when PATCH fails
- [ ] Submit button is disabled while the PATCH request is in-flight
- [ ] Email is displayed read-only (not an editable input)
- [ ] Sign Out button calls `logout()`; redirect to `/login` handled by `ProtectedRoute`
- [ ] Component tests cover: pre-fill, null normalization, submit happy path, submit error, in-flight disabled state, sign-out, load state, fetch error state
- [ ] `App.routes.test.tsx` asserts `/settings` renders `SettingsScreen` for an onboarded user
- [ ] `docs/ARCHITECTURE.md` frontend layout section includes `features/settings/`
- [ ] `make frontend-verify` passes

---

## Verification

```bash
make frontend-verify
```

Fallback:
```bash
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
