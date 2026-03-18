# Task: Auth Foundation 03 - Frontend Auth Flow + Component Tests

## Goal
Implement frontend auth transport/state/forms/route protection, including component-level tests for login and register.

## Parent Spec
Parent Spec: #1

## Scope
**In:**
- Shared auth transport helpers (`credentials: include`, CSRF header, one-refresh retry)
- Auth types and service module
- Auth context provider (`useAuth`) as source of auth state
- `LoginForm` and `RegisterForm` behavior
- Register -> onboarding redirect behavior
- App route protection wiring
- Component tests for `LoginForm` and `RegisterForm` in this task

**Out:**
- Integration/MSW auth regression suite (handled in Task 04)
- Non-auth feature implementation

## Implementation notes
- Persist CSRF token from login/refresh response body for double-submit requests.
- Clear auth client state on refresh failure.
- Ensure route guard does not create refresh loops.
- Keep component tests colocated with auth feature tests.

## Dependencies
- Depends on Task 02

## Acceptance criteria
- [ ] Login and register forms submit via auth service and handle errors.
- [ ] Register flow redirects to onboarding route after success.
- [ ] Auth context provider exposes authenticated/unauthenticated session state.
- [ ] Protected routes block unauthenticated access.
- [ ] `LoginForm` component tests exist and pass.
- [ ] `RegisterForm` component tests exist and pass.
- [ ] Integration-level auth test suite is not bundled here.

## Verification
```bash
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```

## PR checklist
- [ ] PR references this issue (`Closes #...`)
- [ ] Docs updated if needed (architecture/patterns/review checklist/ADR)
- [ ] Tests added/updated where needed
