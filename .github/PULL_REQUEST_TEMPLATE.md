## Summary

What changed and why?

## Linked Issue

- Closes #

## Scope

**In scope:**
-

**Out of scope:**
-

## Acceptance Criteria Check

- [ ] Acceptance criteria from Task issue are fully met

## Verification

```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest && cd ../frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```

## Docs and Decisions

- [ ] Docs updated as needed
- [ ] Commenting contract checks passed for changed files (`docs/CODE_COMMENTING_CONTRACT.md`)
- [ ] ADR created/linked if decision has lasting architecture/security/perf impact

## Risks / Rollback

- Risk level:
- Rollback plan:
