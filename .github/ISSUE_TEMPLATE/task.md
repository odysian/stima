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
Use tiered verification. Fill exact commands for each tier that apply.

### Tier 1 - Implementation loop (smallest checks proving changed behavior)
- Backend example: `cd backend && .venv/bin/pytest app/features/<feature>/tests/test_<scope>.py`
- Frontend example: `cd frontend && npx vitest run src/features/<feature>/tests/<file>.test.tsx`
- Docs/template/tooling example: `make template-verify`

### Tier 2 - Post-review patch verification (targeted reruns)
- `<exact targeted command for patched findings>`

### Tier 3 - PR/final gate verification (broad checks)
- Backend scope: `make backend-verify`
- Frontend scope: `make frontend-verify`
- Cross-surface scope: `make verify`

### Tier 4 - Operator-only heavy verification (optional)
- `<manual/live/provider-backed check, if required by task>`

## PR checklist
- [ ] PR references this issue (`Closes #...`)
- [ ] Docs updated if needed (architecture/patterns/review checklist/ADR)
- [ ] Tests added/updated where needed
