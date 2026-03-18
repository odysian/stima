---
name: "Spec"
about: "Feature Spec or Technical Spec + acceptance criteria + decision locks"
title: "Spec: "
labels: ["type:spec"]
---

## Summary
What are we building and why?

## Value / User Impact
- Who benefits?
- What improves?

## Scope
**In scope:**
-

**Out of scope:**
-

## How it works (expected behavior)
1.
2.
3.

## Backend plan (if applicable)
- API changes:
- Schema changes:
- Events / realtime changes:
- Guardrails (authz, rate limits, compat, pagination):

## Frontend plan
- State model:
- UI components touched:
- Edge cases:

## Files expected
- Backend:
- Frontend:
- Docs:

## Tests
- Backend:
- Frontend:
- Regression:

## Decision locks (must be Locked before implementation for backend-coupled work)
- [ ] Locked: <decision 1>
- [ ] Locked: <decision 2>
- [ ] Locked: <decision 3>

## ADR links (if lasting architecture/security/perf decision)
- ADR:

## Acceptance criteria
- [ ] ...
- [ ] ...

## Verification
```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest && cd ../frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```

## Notes
Links, screenshots, follow-ups.
