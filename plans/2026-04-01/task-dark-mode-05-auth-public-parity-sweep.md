**Parent Spec:** #150

**Issue Wiring:** parent Spec is `#150`. Upstream dependencies are `#151`, `#152`, `#153`, and `#154`.

## Summary
Finish dark-mode coverage on login/register/onboarding and the public shared quote page, then run the final app-wide parity sweep for route-owned empty/loading/error states and remaining hardcoded visual cleanup.

## Why
These surfaces are easy to miss if dark mode is treated as only an authenticated-app exercise. This Task closes the last visible gaps and acts as the final parity/hardening sweep.

## Problem Framing
- Goal: finish the remaining route coverage and confirm there are no app-wide dark-mode or light-parity gaps left.
- Non-goals: changing the locked theme model, redesigning auth/public surfaces, or reopening earlier shared primitive decisions.
- Constraints:
  - auth screens and public shared quote page are explicitly in scope
  - route-owned empty/loading/error states are explicitly in scope
  - shared/global `LoadingScreen`, `ErrorFallback`, and shared modal theming are not owned by this Task
  - this Task should close out the repo-wide hardcoded visual audit for frontend surfaces
  - final review must include `System`, `Light`, and `Dark`

## Proposed Implementation Plan
1. Apply dark-mode updates to login, register, and onboarding surfaces.
2. Apply dark-mode updates to the public shared quote page.
3. Sweep remaining route-owned empty, loading, and error states not already completed by earlier Tasks.
4. Close any remaining in-scope hardcoded visual issues found during the final audit.
5. Run the final manual parity sweep across `System`, `Light`, and `Dark`.

## Depends On
- #151 — Task: Dark mode foundation, boot behavior, and Settings preference
- #152 — Task: Dark mode shared primitives and chrome conversion
- #153 — Task: Dark mode Quotes calibration and quote flows
- #154 — Task: Dark mode customers, invoices, and authenticated surfaces

## Acceptance Criteria
- [ ] Login, register, and onboarding surfaces receive a dark-mode pass.
- [ ] Public shared quote page receives a dark-mode pass.
- [ ] Remaining route-owned empty, loading, and error states in scope receive a dark-mode pass.
- [ ] Final repo-wide frontend hardcoded visual audit is complete for in-scope surfaces.
- [ ] No remaining in-scope hardcoded visual values force light-theme rendering on dark surfaces.
- [ ] Final manual review is completed in `System`, `Light`, and `Dark`.
- [ ] Light-theme parity is preserved across the touched surfaces.
- [ ] `make frontend-verify` passes.

## Verification
```bash
make frontend-verify
```

Manual checks:
1. Verify login/register/onboarding in `Light` and `Dark`.
2. Verify the public shared quote page in `System`, `Light`, and `Dark`.
3. Verify remaining route-owned empty, loading, and error states do not regress in any theme mode.
4. Verify the final app-wide parity sweep finds no remaining dark-mode gaps or light-theme regressions.

## Labels
- type:task
- area:auth
- area:frontend

## Suggested Issue Command
```bash
gh issue create \
  --title "Task: Dark mode auth, public page, and parity sweep" \
  --label "type:task,area:auth,area:frontend" \
  --body-file plans/2026-04-01/task-dark-mode-05-auth-public-parity-sweep.md
```
