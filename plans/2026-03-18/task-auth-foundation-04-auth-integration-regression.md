# Task: Auth Foundation 04 - Integration/MSW Auth Regression Coverage

## Goal
Add integration-level auth regression coverage and shared mocks that validate end-to-end auth transport contracts.

## Parent Spec
Parent Spec: #1

## Scope
**In:**
- MSW auth handlers for login/refresh/logout/session scenarios
- Shared mock server wiring for auth integration tests
- Integration tests for transport behavior:
  - 401 -> single refresh -> replay
  - refresh failure -> auth state clear
  - CSRF header propagation expectations
  - concurrent 401 single-flight behavior

**Out:**
- Component-level form tests (already handled in Task 03)
- Backend feature implementation changes except test-support fixes

## Implementation notes
- This task is integration-level test hardening only.
- Maintain separation: component tests remain with component task.
- Keep assertions aligned with finalized backend auth response contracts.

## Dependencies
- Depends on Task 03

## Acceptance criteria
- [ ] Integration auth test suite exists and passes.
- [ ] MSW handlers cover login/refresh/logout and error paths.
- [ ] Retry/refresh contract is protected against regression.
- [ ] Task does not duplicate component test scope from Task 03.

## Verification
```bash
cd frontend && npx vitest run
cd frontend && npx tsc --noEmit && npx eslint src/ && npm run build
```

## PR checklist
- [ ] PR references this issue (`Closes #...`)
- [ ] Docs updated if needed (architecture/patterns/review checklist/ADR)
- [ ] Tests added/updated where needed
