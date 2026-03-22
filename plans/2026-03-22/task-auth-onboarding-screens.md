## Task: Reskin Auth and Onboarding Screens

**Type:** `type:task`
**Labels:** `area:frontend`, `area:auth`, `area:profile`, `area:backend`
**Depends on:** Design Foundation task (#37) — design tokens, updated `Input`, `Button`, and `TradeTypeSelector` must be merged first

---

### Goal

Reskin `LoginForm`, `RegisterForm`, and `OnboardingForm` to match the Stitch design. All three screens share the same card-based full-screen layout. This task also updates the `TRADE_TYPES` const in `profile.types.ts` to the full 6-option set.

No logic changes — this is a visual reskin plus a type expansion.

### Non-Goals

- Do not change any auth or profile service logic, API contracts, or hook behaviour
- Do not change routing in `App.tsx`
- Do not add new fields or form validation rules
- Do not add a "Forgot password" flow

---

### Background and Design Reference

All three screens follow the same layout: full-screen `bg-background`, centered "Stima" logo at top, white card containing the form. No top app bar, no bottom nav on any of them.

Design reference: `plans/2026-03-22/stitch-design-notes.md` section 3 — "Login", "Register", "Onboarding"

Stitch HTML source (authoritative for exact class structure):
- Login: `stitch_stima_home/login_screen_final/code.html`
- Register: `stitch_stima_home/register_screen_final_clean/code.html`
- Onboarding: `stitch_stima_home/onboarding_screen/code.html`

Screen PNG references (visual ground truth):
- `stitch_stima_home/login_screen_final/screen.png`
- `stitch_stima_home/register_screen_final_clean/screen.png`
- `stitch_stima_home/onboarding_screen/screen.png`

---

### Implementation Plan

**Step 1 — Expand `TRADE_TYPES` in `frontend/src/features/profile/types/profile.types.ts`**

The current const:
```ts
export const TRADE_TYPES = ["Landscaping", "Power Washing"] as const;
```

Replace with:
```ts
export const TRADE_TYPES = [
  "Plumber",
  "Electrician",
  "Builder",
  "Painter",
  "Landscaper",
  "Other",
] as const;
```

`TradeType` is derived from this const so it updates automatically. The DB column is `String(50)` with no check constraint — no migration required — but the backend Pydantic `TradeType` enum in `profile/schemas.py` does validate this value and must be expanded (see Decision Lock below).

This change will cause a TypeScript error anywhere the old values `"Landscaping"` or `"Power Washing"` appear as literals. Check all usages with `grep -r "Landscaping\|Power Washing" frontend/src` and update them. Likely locations: test fixtures, mock data in MSW handlers.

**Step 2 — Shared layout pattern (apply to all three screens)**

All three screens use this outer shell:
```tsx
<div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8">
  <h1 className="font-headline text-3xl font-bold text-primary mb-8">Stima</h1>
  <div className="w-full max-w-sm bg-surface-container-lowest rounded-xl p-6 ghost-shadow">
    {/* form content */}
  </div>
</div>
```

`ghost-shadow` is a CSS class from the Design Foundation task. Do not inline the box-shadow value here.

**Step 3 — `LoginForm.tsx`**

Per design notes section 3 "Login":
- Heading: `"Welcome Back"` — `font-headline text-2xl font-bold text-on-surface mb-6`
- Email and Password `Input` fields stacked with `gap-4`
- Error banner (when login fails) — place above submit button:
  ```html
  <div class="bg-error-container border-l-4 border-error rounded-lg p-4">
    <p class="text-sm font-medium text-error">{errorMessage}</p>
  </div>
  ```
- Submit button: `"Sign In →"` — `Button variant="primary"` full-width
- Link row: `"Don't have an account?"` plain text + `"Register"` as `<Link>` styled `text-primary font-semibold`

**Step 4 — `RegisterForm.tsx`**

Identical layout to Login. Differences only:
- Heading: `"Create your account"`
- Submit button: `"Create Account →"`
- Link: `"Already have an account?"` + `"Sign In"` link to `/login`

**Step 5 — `OnboardingForm.tsx`**

Same outer shell. Additional content inside the card:
- Heading: `"Set up your business"` — `font-headline text-2xl font-bold text-on-surface`
- Subtitle: `"Tell us a bit about your work so we can tailor your quotes."` — `text-sm text-on-surface-variant mb-6`
- Business Name field (required). Add right-aligned `"* required"` label: `text-xs text-error font-medium`
- First Name + Last Name side-by-side in `grid grid-cols-2 gap-2`
- Trade Type selector: use `TradeTypeSelector` shared component from the Design Foundation task. Pass current `tradeType` state value and an `onChange` handler. The component internally renders the 6-option grid.
- Submit button: `"Continue →"` — `Button variant="primary"`
- **Remove any `"support@stima.com"` link** — per design notes it does not exist

**Step 6 — Update tests**

Existing test files test behaviour (submission, error states, validation). Do not remove behavioural assertions. Update any assertions that check for the old `"Landscaping"` or `"Power Washing"` trade type values to use the new values. Use accessible queries (`getByRole`, `getByLabelText`) rather than class-based selectors so tests remain durable across further styling changes.

---

### Decision Lock — Trade Type Expansion

This task is full-stack. The DB column is `String(50)` with no check constraint — no migration needed. However, `backend/app/features/profile/schemas.py` has a `TradeType(str, enum.Enum)` that currently validates only `"Landscaping"` and `"Power Washing"`. `PATCH /profile` will 422 for any other value until the enum is expanded.

**Backend change required (in this task):** Update `TradeType` in `profile/schemas.py`:
```python
class TradeType(str, enum.Enum):
    PLUMBER = "Plumber"
    ELECTRICIAN = "Electrician"
    BUILDER = "Builder"
    PAINTER = "Painter"
    LANDSCAPER = "Landscaper"
    OTHER = "Other"
```

No migration needed. Update `test_profile.py` to replace fixtures using old values. Read the existing test file before editing to understand the full set of assertions that reference trade type values.

When trade-type-specific extraction prompt conditioning is added later, the backend enum is the single source of truth for allowed values.

---

### Acceptance Criteria

- [ ] `TRADE_TYPES` in `profile.types.ts` is updated to 6 values: Plumber, Electrician, Builder, Painter, Landscaper, Other
- [ ] No TypeScript errors from old `"Landscaping"` / `"Power Washing"` literals — all usages updated
- [ ] All three screens render with `bg-background` full-screen layout and centered `"Stima"` headline in `text-primary`
- [ ] Form card uses `bg-surface-container-lowest rounded-xl p-6 ghost-shadow`
- [ ] Login and Register use the updated `Input` and `Button` shared components
- [ ] Login error banner renders red left-border card above submit button when login fails
- [ ] Onboarding renders Business Name, First/Last Name (2-col), and `TradeTypeSelector` with all 6 options
- [ ] `TradeTypeSelector` in Onboarding reflects the selected trade with green border
- [ ] No `support@stima.com` link in Onboarding
- [ ] No top app bar or bottom nav on any of these three screens
- [ ] All three existing component test files pass; test data updated to use new trade type values
- [ ] `backend/app/features/profile/schemas.py` `TradeType` enum has 6 values matching the frontend list exactly
- [ ] `PATCH /profile` with `trade_type: "Plumber"` returns `200` (not `422`)
- [ ] `make backend-verify` passes cleanly
- [ ] `make frontend-verify` passes cleanly

---

### Files in Scope

Backend:
```
backend/app/features/profile/schemas.py              (expand TradeType enum to 6 values)
```

Tests to update (backend):
```
backend/app/features/profile/tests/test_profile.py  (update fixtures using old enum values)
```

Frontend:
```
frontend/src/features/profile/types/profile.types.ts
frontend/src/features/auth/components/LoginForm.tsx
frontend/src/features/auth/components/RegisterForm.tsx
frontend/src/features/profile/components/OnboardingForm.tsx
```

Tests to update (frontend):
```
frontend/src/features/auth/tests/LoginForm.test.tsx
frontend/src/features/auth/tests/RegisterForm.test.tsx
frontend/src/features/profile/tests/OnboardingForm.test.tsx
frontend/src/features/profile/tests/profileService.integration.test.ts   (old "Landscaping"/"Power Washing" literals on lines 13, 32)
frontend/src/features/settings/tests/SettingsScreen.test.tsx             (old literals on lines 35, 73, 82, 132, 149, 158)
frontend/src/shared/tests/mocks/handlers.ts                              (trade_type: "Landscaping" on line 72)
```

---

### Files Explicitly Out of Scope

- `authService.ts`, `useAuth.ts`, `profileService.ts` — no logic changes
- `App.tsx` — no routing changes
- Any feature screen outside auth and profile

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
