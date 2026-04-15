# Task 02: Auth friction pass (V1 polish)

Parent spec: [#385](https://github.com/odysian/stima/issues/385) · Canonical markdown: `plans/2026-04-14/spec-v1-polish.md` · This Task: [#387](https://github.com/odysian/stima/issues/387).

## Summary
Deliver **Phase 2** of the V1 polish spec: reduce first-use auth mistakes on **register** and **login** with confirm-password, inline mismatch feedback, and accessible password visibility toggles — **frontend-only**; no new backend fields, routes, or auth API contracts.

## Scope
**In scope**
- **Register** (`RegisterForm.tsx`): second **confirm password** field; block submit when it does not match the password field; show inline mismatch feedback while applicable; keep existing register API payload (single password value as today).
- **Register + login** (`LoginForm.tsx`): **show/hide password** toggles per field that uses `type="password"` (use `type="button"` for the toggle control, keyboard operable, `aria-pressed` and/or `aria-label` so screen readers know state).
- **Tests**: extend `RegisterForm.test.tsx` for mismatch path; extend `LoginForm.test.tsx` (and register toggle tests) for visibility behavior where practical without brittle DOM snapshots.

**Out of scope**
- Phase 1 (public document / PDF) and Phase 3 (favicon / loading shell) — separate Tasks.
- **Forgot password** and **reset password** pages — no parity toggles unless a follow-up Task explicitly scopes them.
- Backend: new columns, validation endpoints, or changed request/response shapes for register/login.
- Broader auth redesign (OAuth, passkeys, password strength meters beyond existing behavior, etc.).

## Decision locks (align with parent spec #385)
- [ ] Auth work is **frontend-only UX**; backend auth contracts and payloads unchanged.
- [ ] Confirm password is a **client-side guardrail** only (no server-side duplicate field).
- [ ] No new routes, migrations, or API versions for this Task.

## Acceptance criteria
- [ ] Register form includes a **confirm password** input shown alongside the primary password field.
- [ ] Submit is **blocked** when password and confirm password differ, with **inline** error text (not only a toast); **once the two fields match again during typing, that inline mismatch message clears automatically** (frontend-only, no refetch); matching pair allows submit as before.
- [ ] Login and register forms each expose a **password visibility toggle** that switches masked/plain text without breaking focus order.
- [ ] Toggles use **`type="button"`** and appropriate **accessible names / `aria-pressed`** (or equivalent) so assistive tech reports hidden vs visible state.
- [ ] **Autofill** and **keyboard** (Tab / Enter submit) behavior remain acceptable on Chrome and Firefox in manual spot-check; automated tests cover mismatch + toggle where feasible.
- [ ] **No backend** auth handler, schema, or OpenAPI contract changes attributable to this Task.

## Implementation notes
- **`autocomplete` (HTML only — browser/password-manager hints, not an auth contract change):** login email `autocomplete="email"`, login password `autocomplete="current-password"`; register email `autocomplete="email"`; register password `autocomplete="new-password"`; register confirm password `autocomplete="new-password"`.

## Files (expected)
- `frontend/src/features/auth/components/RegisterForm.tsx`
- `frontend/src/features/auth/components/LoginForm.tsx`
- `frontend/src/features/auth/tests/RegisterForm.test.tsx`
- `frontend/src/features/auth/tests/LoginForm.test.tsx`

## Verification (Tier 1)
```bash
cd frontend && npx vitest run \
  src/features/auth/tests/RegisterForm.test.tsx \
  src/features/auth/tests/LoginForm.test.tsx
```

Tier 3 gate before merge: `make frontend-verify` (or `make verify` if your PR workflow requires it).

## PR
- Branch: `task-387-v1-polish-auth-friction` (or equivalent slug).
- PR body references spec **#385**; use `Closes #387` for **this** Task issue only (not the Spec).
