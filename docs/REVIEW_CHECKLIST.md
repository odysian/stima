# Review Checklist - Stima

## Correctness
- [ ] Behavior matches acceptance criteria
- [ ] Edge cases are handled
- [ ] No regression in related flows

## Architecture And Boundaries
- [ ] Backend layering is preserved (`api -> services -> repositories -> integrations/libs`)
- [ ] Frontend feature boundaries are respected
- [ ] Module size guardrails were respected or explicitly deferred
- [ ] New models are registered in `backend/app/features/registry.py`

## Security
- [ ] Authn/authz checks are correct
- [ ] Mutating authenticated endpoints validate CSRF (`Depends(require_csrf)`)
- [ ] New auth endpoints include rate limiting with proxy-aware IP extraction
- [ ] Cookie settings are env-driven, not hard-coded
- [ ] Inputs are validated on trusted boundaries
- [ ] No secrets in code, logs, or config

## Tests
- [ ] Happy path covered
- [ ] Error path covered
- [ ] Test layer discipline: component tests use `vi.mock`, integration tests use MSW, transport tests use `vi.stubGlobal` — no mixing
- [ ] Test-focused tasks include "Do NOT duplicate" section
- [ ] Verification commands pass (`make backend-verify`, `make frontend-verify`)

## Docs
- [ ] Architecture/pattern docs updated if needed
- [ ] Issue and PR links are complete

## CI
- [ ] CI status checked (`GitHub Actions: .github/workflows/backend-test.yml and .github/workflows/frontend-test.yml`)
