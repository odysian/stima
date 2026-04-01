**Parent Spec:** #150

**Issue Wiring:** parent Spec is `#150`. Upstream dependency is `#151`.

## Summary
Complete the dark-mode CSS contract and shared visual infrastructure so the app uses the full semantic token remap, dual-path selector model, and token-backed shadows, gradients, glass treatments, and shared surface patterns instead of hardcoded light-theme assumptions.

## Why
If shared primitives stay light-biased, route-level Tasks will either regress visually or duplicate one-off fixes. This Task creates the reusable dark-mode building blocks that the screen Tasks should inherit.

## Problem Framing
- Goal: make shared primitives and visual infrastructure dark-mode-safe before screen-by-screen calibration.
- Non-goals: full Quotes/customer/auth/public route coverage, boot logic, or preference model design.
- Constraints:
  - this Task owns the complete dark semantic token remap from addendum §2.2
  - this Task owns the full selector mechanism from addendum §7.5, including both the OS-fallback media-query path and the explicit `[data-theme="dark"]` override path
  - `.forest-gradient` and `.ghost-shadow` must become token/custom-property backed
  - shared shell shadows should move to shared classes, not inline raw utilities
  - shared components should not reintroduce hardcoded light-only fills or shadows
  - shared/global loading, error, and modal surfaces are owned by this Task
  - light-theme behavior must remain intact

## Proposed Implementation Plan
1. Complete the full dark semantic token remap in `frontend/src/index.css` from addendum §2.2.
2. Implement the full selector mechanism from addendum §7.5, including both `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }` and explicit `[data-theme="dark"] { ... }`.
3. Convert shared visual helpers in `frontend/src/index.css` to token/custom-property-backed implementations.
4. Add shared shadow classes for shell/chrome use and remove inline JIT shadow dependencies in shared chrome.
5. Update shared components such as header/footer/nav/button/input/modal/feedback plus shared/global loading and error surfaces to use the shared dark-safe primitives.
6. Remove shared hardcoded light-only fills and overlays where they would break dark mode.
7. Add or update tests for shared component class/behavior expectations where practical.

## Depends On
- #151 — Task: Dark mode foundation, boot behavior, and Settings preference

## Acceptance Criteria
- [ ] `.forest-gradient` uses theme tokens rather than hardcoded hex values.
- [ ] `.ghost-shadow` uses shared/custom-property-backed shadow values.
- [ ] The full dark semantic token remap from addendum §2.2 is present in `frontend/src/index.css`.
- [ ] The full selector mechanism from addendum §7.5 is implemented, including both the OS-fallback media-query path and the explicit `[data-theme="dark"]` path.
- [ ] `--color-on-background` is added to the dark token block with the same value as `--color-on-surface`.
- [ ] Shared shell primitives use shared shadow classes rather than inline raw JIT shadow utilities.
- [ ] Shared components do not depend on hardcoded light-only fills where dark mode needs token-safe behavior.
- [ ] Shared/global `LoadingScreen`, `ErrorFallback`, and shared modal theming are completed in this Task.
- [ ] Shared components preserve current layout and interaction structure.
- [ ] Shared components preserve light-theme parity.
- [ ] Non-blocking extra dark token overrides such as `surface`, `surface-bright`, `surface-dim`, and `surface-container-highest` are optional completeness work, not required for Task acceptance.
- [ ] This Task does not claim route-by-route full dark-mode completion.
- [ ] `make frontend-verify` passes.

## Verification
```bash
make frontend-verify
```

Manual checks:
1. Verify header/footer/bottom-nav read correctly in both `Light` and `Dark`.
2. Verify shared button/input/modal/feedback surfaces use the intended dark surface ladder.
3. Verify shared/global `LoadingScreen`, `ErrorFallback`, and modal surfaces read correctly in both `Light` and `Dark`.
4. Verify no shared component regresses when explicit `Light` is selected.

## Labels
- type:task
- area:frontend

## Suggested Issue Command
```bash
gh issue create \
  --title "Task: Dark mode shared primitives and chrome conversion" \
  --label "type:task,area:frontend" \
  --body-file plans/2026-04-01/task-dark-mode-02-shared-primitives-chrome.md
```
