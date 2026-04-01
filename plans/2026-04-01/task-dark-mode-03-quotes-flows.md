**Parent Spec:** #150

**Issue Wiring:** parent Spec is `#150`. Upstream dependencies are `#151` and `#152`.

## Summary
Calibrate dark mode against the Quotes experience and complete the quote-related route coverage: list, preview, capture, review, edit, and quote-specific empty/loading/error states.

## Why
The Spec explicitly makes Quotes the calibration target. This Task is where the dark surface ladder, scanability, and primary-action discipline are proven on the most important workflow.

## Problem Framing
- Goal: make Quotes the canonical dark-mode reference surface for the rest of the app.
- Non-goals: settings preference plumbing, shared primitive infrastructure, customer/invoice/auth/public surface completion.
- Constraints:
  - preserve the current quote flow structure and scan pattern
  - this Task owns the home screen document list in Quotes mode and the shared Quotes/Invoices segmented control on that screen
  - segmented controls stay selection controls, not CTAs
  - search/input surfaces must preserve recessed-vs-lifted hierarchy
  - quote cards must remain scannable without border-based separation
  - quote-specific loading/empty/error states are in scope

## Proposed Implementation Plan
1. Calibrate the Quotes list dark surface ladder using the locked addendum criteria.
2. Apply the same token-correct treatment across quote preview, capture, review, and edit flows.
3. Remove quote-specific hardcoded light-only visual assumptions discovered during implementation.
4. Verify primary-action discipline and active-state contrast in quote surfaces.
5. Add or update targeted frontend tests where practical.

## Depends On
- #151 — Task: Dark mode foundation, boot behavior, and Settings preference
- #152 — Task: Dark mode shared primitives and chrome conversion

## Acceptance Criteria
- [ ] Quotes list satisfies the addendum’s calibration criteria for the home screen in Quotes mode, including search, the shared Quotes/Invoices segmented control, list container, cards, metadata readability, and FAB emphasis.
- [ ] Quote preview, capture, review, and edit flows all receive a dark-mode pass.
- [ ] Quote-specific empty/loading/error states receive a dark-mode pass.
- [ ] Quote surfaces do not rely on hardcoded light-only fills, shadows, or gradients still in scope.
- [ ] Primary-action discipline remains intact across quote surfaces.
- [ ] Light-theme quote behavior remains visually aligned with the current design system.
- [ ] `make frontend-verify` passes.

## Verification
```bash
make frontend-verify
```

Manual checks:
1. Verify Quotes list in `Dark` against the calibration checklist from the addendum.
2. Verify quote preview, capture, review, and edit surfaces in both `Light` and `Dark`.
3. Verify active state readability for quote tabs/controls after final `primary` tuning.

## Labels
- type:task
- area:quotes
- area:frontend

## Suggested Issue Command
```bash
gh issue create \
  --title "Task: Dark mode Quotes calibration and quote flows" \
  --label "type:task,area:quotes,area:frontend" \
  --body-file plans/2026-04-01/task-dark-mode-03-quotes-flows.md
```
