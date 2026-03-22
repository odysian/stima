# Spec: Test gap coverage

**Mode:** gated
**Type:** test hardening (no behavior changes)

## Motivation

The existing test suite (19 backend files, 33 frontend files) covers happy paths well. However, several gaps surfaced during the post-V0 review:

| Gap | Priority | Risk |
|---|---|---|
| `POST /api/auth/register` has zero dedicated API tests | High | Critical endpoint with rate limiting, validation, and conflict handling — all untested |
| Auth rate limits (register 3/hr, login 5/min, etc.) not explicitly tested | Medium | Rate limits exist in code but only the extraction endpoint's limit is verified |
| Error paths sparse (404/409/422) across backend endpoints | Medium | Tests prove features work but don't prove they fail correctly |
| Frontend error/loading states undertested | Medium | Component tests cover happy paths but skip error rendering, loading states, and edge cases |

**What's already solid:**
- Quote CRUD, extraction, PDF, share — comprehensive backend tests (824+ lines in test_quotes.py alone)
- All mutating endpoints tested for CSRF validation
- Ownership isolation tested across all features
- Frontend service integration tests via MSW for all endpoints
- Transport layer (http.ts) thoroughly tested including single-flight refresh
- Test layer discipline enforced: component tests use vi.mock, integration tests use MSW, transport tests use vi.stubGlobal

## Child tasks

- **Task A:** [Backend auth & rate limit tests](task-test-a-backend-auth.md) — Register endpoint tests + auth rate limit verification
- **Task B:** [Backend error path hardening](task-test-b-backend-error-paths.md) — 404/409/422/validation edge cases across all endpoints
- **Task C:** [Frontend error state tests](task-test-c-frontend-error-states.md) — Error rendering, loading states, and edge cases in component tests

## Execution order

Tasks A, B, and C are independent and can be done in any order. No dependencies between them or on other specs.

## Verification

```bash
make backend-verify
make frontend-verify
```
