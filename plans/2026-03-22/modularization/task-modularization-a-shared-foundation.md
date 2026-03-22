# Task A: Shared foundation — formatters, ScreenHeader, ScreenFooter, FeedbackMessage

**Parent Spec:** Codebase modularization
**Mode:** gated child task
**Type:** no-contract refactor

## Summary

Extract four shared utilities/components that are currently duplicated or inconsistent across the codebase, then apply them to all screens for consistency. Also delete three dead stub files.

## Scope

### 1. Extract `shared/lib/formatters.ts`

Deduplicate currency/date formatting found in 4 files:

```ts
export function formatCurrency(value: number): string
export function formatDate(isoString: string): string
```

Add a co-located `formatters.test.ts` with unit tests covering `formatCurrency` (integer, decimal, zero, null-like edge cases) and `formatDate` (valid ISO string, timezone handling). These are the canonical formatting functions for every monetary value and date displayed in the app — a silent regression here touches every consumer.

**Consumers to update (remove local copies):**
- `QuoteList.tsx` — local `formatTotalAmount`, `formatCreatedDate`
- `CustomerDetailScreen.tsx` — local `formatTotalAmount`, `formatCreatedDate`
- `ReviewScreen.tsx` — local `formatCurrency`
- `QuotePreview.tsx` — local `currencyFormatter`

### 2. Extract `shared/components/ScreenHeader.tsx`

Standardize the glassmorphism top bar used inline across 8 screens with inconsistent styling.

```tsx
interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  trailing?: React.ReactNode;
}
```

Canonical styling: `fixed top-0 z-50 h-16 w-full bg-white/80 backdrop-blur-md shadow-[0_0_24px_rgba(13,28,46,0.04)]`

**Consumers:** QuotePreview, CaptureScreen, ReviewScreen, EditLineItemScreen, CustomerSelectScreen, CustomerDetailScreen, CustomerCreateScreen, SettingsScreen

### 3. Extract `shared/components/ScreenFooter.tsx`

Standardize the sticky bottom action bar used in 3 screens.

```tsx
interface ScreenFooterProps {
  children: React.ReactNode;
}
```

Canonical styling: `fixed bottom-0 z-40 w-full bg-white/80 backdrop-blur-md p-4 shadow-[0_-4px_24px_rgba(0,0,0,0.04)]`

**Consumers:** CaptureScreen, ReviewScreen, EditLineItemScreen

### 4. Extract `shared/components/FeedbackMessage.tsx`

Standardize inline error messages. Currently inconsistent between hardcoded Tailwind (`bg-red-50 text-red-700`) and design tokens (`border-error bg-error-container text-error`).

```tsx
interface FeedbackMessageProps {
  variant: "error";
  children: React.ReactNode;
}
```

Uses error design tokens only (`border-error bg-error-container text-error`). Replaces all inline error `<p>` blocks across screens.

**Error message consumers** (screens with inline error `<p>`/`<div role="alert">` blocks to replace):
- `CaptureScreen.tsx` — audio capture error
- `ReviewScreen.tsx` — submission error
- `EditLineItemScreen.tsx` — save error
- `CustomerSelectScreen.tsx` — create error (×2: inline create form + list fetch error)
- `CustomerCreateScreen.tsx` — create error

Auth/profile screens (`LoginForm`, `RegisterForm`, `OnboardingForm`) use the same pattern but are outside the 8-screen scope of this task — leave them for the token sweep.

**Success messages are out of scope for this task.** Inline success feedback (`bg-emerald-50 text-emerald-700`) in `CustomerDetailScreen` and `SettingsScreen` is left as-is. The design token sweep task adds success tokens to `index.css`, extends `FeedbackMessage` with `variant="success"`, and replaces those messages in one pass.

### 5. Delete dead stubs

- `frontend/src/shared/hooks/useApi.ts` — empty stub, zero consumers
- `frontend/src/shared/lib/api.types.ts` — empty stub, zero consumers
- `backend/app/shared/exceptions.py` — empty stub, zero imports

### 6. Apply shared components to all screens

Replace all inline `<header>` blocks with `<ScreenHeader>` across all 8 screens listed above.
Replace all inline `<footer>` blocks with `<ScreenFooter>` in CaptureScreen, ReviewScreen, EditLineItemScreen.
Replace all inline error `<p>` blocks with `<FeedbackMessage variant="error">` across all screens. Leave success `<p>` blocks untouched.
Replace all local formatters with imports from `shared/lib/formatters.ts`.

### 7. Add file-size guardrail script

Add `scripts/check_file_sizes.sh` that enforces a mixed policy:

**Frontend — two tiers:**
- **Warn** (non-blocking, exit 0) when a file crosses the budget target:
  - Components: 250 LOC
  - Hooks/services: 180 LOC
- **Fail** (blocking, exit 1) when a file crosses the split threshold:
  - Components: 450 LOC
  - Hooks/services: 300 LOC

**Backend — warn only:**
- **Warn** (non-blocking, exit 0) when a route/service/repository crosses 220 LOC
- No hard fail tier for backend files

Rationale: UI component splits have clear rendering boundaries — a 450-line component is almost never defensible. Backend cohesion doesn't correlate with line count the same way; a 400-line repository can be completely cohesive (e.g. `repository.py`), while a 280-line service mixing two unrelated concerns is a real problem that LOC alone won't catch. Backend warns are evaluated at PR review time using the domain-boundary test (do the two halves inject different dependencies? do they change for different reasons?), not resolved automatically by splitting.

Wire into both `make frontend-verify` and `make backend-verify` in the Makefile, following the same pattern as `check_backend_boundaries.sh`.

Also update `docs/PATTERNS.md` to document the backend evaluation rule: a backend file-size warning is a flag to inspect at review, not a mandate to split. The split decision is made by asking whether the two halves have different collaborators and different reasons to change.

### 8. Update `docs/PATTERNS.md` with new shared components

Add a section documenting the canonical shared screen primitives so future work uses them by default:

- `ScreenHeader` — when to use, props, canonical styling
- `ScreenFooter` — when to use, props, canonical styling
- `FeedbackMessage` — when to use (replaces all inline error/success messages)
- `formatCurrency` / `formatDate` — import path, when to use (replaces all local formatters)
- New screen checklist: "New screen? Use `ScreenHeader`, `ScreenFooter`, `FeedbackMessage`, import from `formatters.ts`."

## Files touched

**New files:**
- `frontend/src/shared/lib/formatters.ts`
- `frontend/src/shared/lib/formatters.test.ts`
- `frontend/src/shared/components/ScreenHeader.tsx`
- `frontend/src/shared/components/ScreenFooter.tsx`
- `frontend/src/shared/components/FeedbackMessage.tsx`
- `scripts/check_file_sizes.sh`

**Modified files:**
- `frontend/src/features/quotes/components/QuotePreview.tsx`
- `frontend/src/features/quotes/components/ReviewScreen.tsx`
- `frontend/src/features/quotes/components/CaptureScreen.tsx`
- `frontend/src/features/quotes/components/EditLineItemScreen.tsx`
- `frontend/src/features/quotes/components/QuoteList.tsx`
- `frontend/src/features/customers/components/CustomerDetailScreen.tsx`
- `frontend/src/features/customers/components/CustomerSelectScreen.tsx`
- `frontend/src/features/customers/components/CustomerCreateScreen.tsx`
- `frontend/src/features/settings/components/SettingsScreen.tsx`
- `Makefile` (wire `check_file_sizes.sh` into verify targets)
- `docs/PATTERNS.md` (document new shared components + new screen checklist)

**Deleted files:**
- `frontend/src/shared/hooks/useApi.ts`
- `frontend/src/shared/lib/api.types.ts`
- `backend/app/shared/exceptions.py`

## Acceptance criteria

- [ ] `formatCurrency` and `formatDate` live in one shared file; no local copies remain
- [ ] `formatters.test.ts` exists with unit tests for both functions
- [ ] All 8 screens use `<ScreenHeader>` — no inline `<header>` blocks with glassmorphism styling
- [ ] CaptureScreen, ReviewScreen, EditLineItemScreen use `<ScreenFooter>` — no inline `<footer>` blocks
- [ ] All inline error `<p>` blocks replaced with `<FeedbackMessage variant="error">` — no hardcoded `bg-red-50`/`text-red-700` remains
- [ ] Inline success messages (`bg-emerald-50`/`text-emerald-700`) left as-is — deferred to design token sweep
- [ ] Dead stubs deleted
- [ ] `scripts/check_file_sizes.sh` exists and runs in both `make frontend-verify` and `make backend-verify`
- [ ] Frontend: warns at budget (250/180), fails at split threshold (450/300)
- [ ] Backend: warns at 220 LOC only — no hard fail tier
- [ ] `docs/PATTERNS.md` documents the backend evaluation rule for file-size warnings
- [ ] `docs/PATTERNS.md` updated with shared component documentation + new screen checklist
- [ ] All existing tests pass without modification

## Parity lock

- Status code parity: N/A (frontend-only, no API changes)
- Response schema parity: N/A
- Error semantics parity: same error messages rendered, just via shared component
- Side-effect parity: no behavior changes

## Verification

```bash
make frontend-verify
```
