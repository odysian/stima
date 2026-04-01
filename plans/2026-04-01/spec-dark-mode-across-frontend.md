# Spec — Dark Mode Across Frontend

**Date:** 2026-04-01
**Reference:** `docs/DARK_MODE_ADDENDUM.md`
**Mode:** gated (1 spec -> 5 child tasks -> 5 PRs)
**Area:** frontend

---

## Goal

Deliver an app-wide dark mode for Stima that preserves the existing design system rather than redesigning it.

This spec locks:
- a `System / Light / Dark` preference model
- attribute-based theme application on `<html>` with OS fallback
- pre-React boot behavior with no flash of the wrong theme
- full shipped frontend coverage, not Quotes-only
- light-theme parity as a completion requirement

---

## Why This Spec Exists

Dark mode in this repo is not a single-screen polish pass. It affects:
- global theme resolution and persistence
- browser chrome and first-paint behavior
- shared shell primitives and token infrastructure
- authenticated app screens, auth surfaces, and the public shared quote page
- existing light-theme behavior that must remain intact

That scope is too broad for a single Task and too cross-cutting to leave split decisions to the implementation agent.

---

## Canonical Decision Locks

These rules are locked for implementation unless this Spec is revised first.

1. **Theme model is `System / Light / Dark`**
   - `System` follows `prefers-color-scheme`
   - `Light` forces the existing light theme
   - `Dark` forces the dark theme

2. **Theme mechanism is attribute toggle with OS fallback**
   - effective theme is applied on the `<html>` element
   - explicit user preference wins over OS
   - missing or `system` preference falls back to `prefers-color-scheme`
   - theme preference is stored in `localStorage` under the key `stima-theme`
   - no server-side theme preference storage is used in this spec
   - invalid or unexpected `stima-theme` values are treated as `system`
   - while preference is `system`, the app updates live if the OS theme changes during an open session

3. **Theme control UI is in scope**
   - Settings includes a `Theme` control
   - the control offers exactly `System`, `Light`, and `Dark`
   - changing the preference updates the effective theme immediately
   - the control uses the segmented control pattern

4. **Initial paint must use the correct theme**
   - theme resolution runs before React mounts
   - boot logic lives in `frontend/index.html`
   - `color-scheme` is set with the effective theme
   - visible flash of the wrong theme is a failure

5. **Dark mode is a token/chrome extension, not a redesign**
   - no layout rework
   - no component redesigns solely for dark mode
   - no screen-local palette improvisation

6. **Quotes is the calibration target, not the scope boundary**
   - completion requires full shipped frontend coverage
   - auth, onboarding, settings, invoices, customers, public quote page, modal/dialog, empty/loading/error states are all in scope

7. **Dark active-state contrast is a locked accessibility gate**
   - dark `primary` may be brightened as needed so `text-primary` remains valid for active text/icon use
   - final value stays in the Stima forest family and must be manually approved

8. **Light-theme parity is mandatory**
   - explicit `Light` selection must preserve the current light system
   - dark-mode work does not justify light-theme regressions

---

## Scope

### In scope
- Theme preference storage, resolution, and Settings UI
- Pre-React boot behavior for theme and `color-scheme`
- Dark token overrides in `frontend/src/index.css`
- Shared shadow/glass/token-backed visual primitives
- Shared components and route-level surfaces needed for full dark-mode coverage
- Use the canonical dark-mode addendum at `docs/DARK_MODE_ADDENDUM.md` as the execution reference
- Repo-wide hardcoded visual audit for in-scope frontend surfaces
- Manual review in `System`, `Light`, and `Dark`

### Out of scope
- Backend changes
- New design system direction beyond the approved dark-mode addendum
- New navigation/IA
- Theme-specific redesigns or layout changes
- New user preference surfaces outside Settings

---

## Child Task Breakdown

### Task 1 — Theme foundation, boot behavior, and Settings preference
- Issue: #151
- Owns theme model plumbing, persistence, `<html>` application, no-flash boot behavior, `color-scheme`, and Settings preference UI
- Owns the minimal selector/token scaffolding needed so first paint is visually correct for `System`, `Light`, and `Dark`
- Must land first because all later Tasks depend on the effective theme contract

### Task 2 — Shared primitives and chrome conversion
- Issue: #152
- Owns the complete dark semantic token remap from the addendum plus the full dual-path CSS contract (`@media ... :root:not([data-theme="light"])` and `[data-theme="dark"]`), then applies shared shell/component conversion
- Must land before route-level screen calibration to avoid repeated screen-local hacks

### Task 3 — Quotes calibration and quote flows
- Issue: #153
- Owns Quotes list, preview, capture, review, edit, and quote-specific states
- Serves as the calibration anchor for the dark surface ladder

### Task 4 — Customers, invoices, and authenticated surface pass
- Issue: #154
- Owns customer and invoice flows plus remaining authenticated surfaces not already completed in Tasks 1-3
- Applies the system to the rest of the signed-in app

### Task 5 — Auth, public page, and final parity sweep
- Issue: #155
- Owns login/register/onboarding, public shared quote page, remaining modal/empty/loading/error states, final hardcoded audit closeout, and final parity sweep
- Should run after the earlier surface Tasks so it can act as the clean final sweep

---

## Task Order And Dependencies

1. Task 1 — foundation, boot, and Settings preference
2. Task 2 — shared primitives and chrome
3. Task 3 — Quotes calibration and quote flows
4. Task 4 — Customers, invoices, and authenticated surfaces
5. Task 5 — Auth, public page, and final parity sweep

Dependency rules:
- Task 2 depends on Task 1
- Task 3 depends on Tasks 1-2
- Task 4 depends on Tasks 1-3
- Task 5 depends on Tasks 1-4

Issue set:
- Spec: #150
- Task 1: #151
- Task 2: #152
- Task 3: #153
- Task 4: #154
- Task 5: #155

---

## Global Acceptance Criteria

- [ ] Theme model is implemented as `System / Light / Dark`
- [ ] Effective theme is applied on `<html>` with explicit override support and OS fallback
- [ ] Invalid or unexpected `stima-theme` values fall back to `system`
- [ ] While preference is `System`, an OS theme change updates the app live during an open session
- [ ] First paint uses the correct theme with no visible flash
- [ ] `color-scheme` matches the effective theme
- [ ] Settings includes a working `Theme` control with `System`, `Light`, and `Dark`
- [ ] Shared shadows/gradients/glass treatments use shared or token-backed infrastructure rather than ad-hoc raw utilities
- [ ] Quotes remains the calibration target and meets the dark-mode readability criteria from the addendum
- [ ] Full shipped frontend coverage is reviewed, including auth, onboarding, settings, customers, invoices, public quote page, modal/dialog, empty/loading/error states
- [ ] No remaining in-scope hardcoded visual values force light-theme rendering on dark surfaces
- [ ] Light theme remains aligned with `docs/DESIGN.md`
- [ ] `make frontend-verify` passes for each implementing Task
- [ ] Final manual review is completed in `System`, `Light`, and `Dark`

---

## Verification

```bash
make frontend-verify
```

Manual review gates:
1. Verify boot behavior and reload behavior in `System`, `Light`, and `Dark`.
2. Verify Quotes remains the calibration anchor for surface hierarchy and scanability.
3. Verify customer/invoice/auth/public surfaces all receive an intentional dark-mode pass.
4. Verify no light-theme regressions after explicit `Light` selection.

---

## Labels
- type:spec
- area:frontend
- area:docs

## Suggested Issue Command
```bash
gh issue create \
  --title "Spec: Dark mode across frontend" \
  --label "type:spec,area:frontend,area:docs" \
  --body-file plans/2026-04-01/spec-dark-mode-across-frontend.md
```
