# Review Checklist - Stima

## Correctness
- [ ] Behavior matches acceptance criteria
- [ ] Edge cases are handled
- [ ] No regression in related flows

## Architecture And Boundaries
- [ ] Backend layering is preserved (`api -> services -> repositories -> integrations/libs`)
- [ ] Frontend feature boundaries are respected
- [ ] Module size guardrails were respected or explicitly deferred

## Security
- [ ] Authn/authz checks are correct
- [ ] Inputs are validated on trusted boundaries
- [ ] No secrets in code, logs, or config

## Tests
- [ ] Happy path covered
- [ ] Error path covered
- [ ] Verification commands pass

## Docs
- [ ] Architecture/pattern docs updated if needed
- [ ] Issue and PR links are complete

## CI
- [ ] CI status checked (`GitHub Actions: .github/workflows/backend-test.yml and .github/workflows/frontend-test.yml`)
