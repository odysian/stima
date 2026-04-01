**Parent Spec:** #150

**Issue Wiring:** parent Spec is `#150`. Upstream dependencies are `#151`, `#152`, and `#153`.

## Summary
Apply the dark-mode system to the remaining authenticated app surfaces after Quotes: customers, invoices, Settings visual pass, and related authenticated empty/loading/error states.

## Why
Once Quotes proves the system, the rest of the signed-in app needs a deliberate pass so dark mode does not stop at the flagship flow.

## Problem Framing
- Goal: extend the approved dark-mode system across the rest of the authenticated product surface.
- Non-goals: boot logic, theme preference plumbing, auth/public-page coverage, final app-wide parity sweep.
- Constraints:
  - use the shared infrastructure from Tasks 1-2
  - preserve existing screen layout and interaction model
  - include customer and invoice state variants, not just happy-path loaded screens
  - include `CustomerInlineCreateForm` and the create mode inside `CustomerSelectScreen`
  - include the invoice line-item editor route as part of invoice edit coverage
  - shared/global `LoadingScreen`, `ErrorFallback`, and shared modal theming are not owned by this Task
  - include Settings as a visual surface, while preference-control plumbing remains owned by Task 1

## Proposed Implementation Plan
1. Apply token-correct dark-mode updates to customer list/detail/create/select/history surfaces, including `CustomerInlineCreateForm` and the create branch inside `CustomerSelectScreen`.
2. Apply token-correct dark-mode updates to the invoice list tab on the home screen in invoice-filter mode plus invoice detail/edit surfaces, including the invoice line-item editor route.
3. Complete the authenticated Settings visual pass using the shared system.
4. Resolve remaining route-owned authenticated hardcoded light-only values discovered during implementation.
5. Add or update targeted tests where practical.

## Depends On
- #151 — Task: Dark mode foundation, boot behavior, and Settings preference
- #152 — Task: Dark mode shared primitives and chrome conversion
- #153 — Task: Dark mode Quotes calibration and quote flows

## Acceptance Criteria
- [ ] Customers list/detail/create/select/history surfaces receive a dark-mode pass.
- [ ] `CustomerInlineCreateForm` and the create mode inside `CustomerSelectScreen` receive a dark-mode pass.
- [ ] Invoice list tab on the home screen in invoice-filter mode receives a dark-mode pass.
- [ ] Invoice detail/edit surfaces receive a dark-mode pass.
- [ ] Invoice line-item editor route receives a dark-mode pass.
- [ ] Settings visual surface receives a dark-mode pass beyond the preference-control plumbing.
- [ ] Route-owned authenticated empty/loading/error states in scope receive a dark-mode pass.
- [ ] These surfaces do not retain in-scope hardcoded light-only visual assumptions.
- [ ] Light-theme parity is preserved for these surfaces.
- [ ] `make frontend-verify` passes.

## Verification
```bash
make frontend-verify
```

Manual checks:
1. Verify customer list/detail/create/select/history surfaces in `Light` and `Dark`, including the inline-create branch.
2. Verify the home-screen invoice tab plus invoice detail/edit surfaces in `Light` and `Dark`.
3. Verify the invoice line-item editor route in `Light` and `Dark`.
4. Verify Settings reads correctly as a screen in all theme modes after Task 1 preference plumbing is in place.

## Labels
- type:task
- area:customers
- area:frontend

## Suggested Issue Command
```bash
gh issue create \
  --title "Task: Dark mode customers, invoices, and authenticated surfaces" \
  --label "type:task,area:customers,area:frontend" \
  --body-file plans/2026-04-01/task-dark-mode-04-customers-invoices-authenticated-surfaces.md
```
