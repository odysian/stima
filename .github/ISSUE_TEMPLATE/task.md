---
name: "Task"
about: "Small implementable unit that becomes a PR"
title: "Task: "
labels: ["type:task"]
---

> Add `1-3` `area:` labels from `docs/ISSUES_WORKFLOW.md` before creating this issue.

## Goal
What should exist when this is done?
Default: this Task should represent the entire feature end-to-end unless split criteria apply.

## Scope
**In:**
-

**Out:**
-

## Implementation notes
-

## Decision locks (backend-coupled only)
- [ ] Locked: <decision 1>
- [ ] Locked: <decision 2>

## Acceptance criteria
- [ ] ...

## Verification
```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest && cd ../frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```

## PR checklist
- [ ] PR references this issue (`Closes #...`)
- [ ] Docs updated if needed (architecture/patterns/review checklist/ADR)
- [ ] Tests added/updated where needed
