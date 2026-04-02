# Execution Brief Template

Use this brief only when a GitHub Task issue already exists.

- The GitHub Task issue is the source of truth.
- This brief is task-local only.
- Keep it compressed: capture deltas, concrete file scope, and task-specific decisions without reprinting stable repo rules.

## Task

- Task issue: `#<task-id>`
- Task title: `<copy issue title>`
- Source of truth link: `<GitHub issue URL>`

## Goal

`<What this task should accomplish in 1-3 sentences.>`

## Non-goals

- `<Explicitly out-of-scope behavior or files>`
- `<Anything this brief should not silently expand into>`

## Files In Scope

- `<path>` - `<why this file matters>`
- `<path>` - `<why this file matters>`

## Analog Files / Docs

- `<path>` - `<how this analog applies>`
- `<path>` - `<which contract or pattern to follow>`

## Locked Decisions

- `<Decision that should not be reopened during implementation>`
- `<Decision or constraint inherited from the issue/spec>`

## Acceptance Criteria Delta

- Issue acceptance criteria live in the Task. Only list task-specific deltas, clarifications, or parity checks here.
- `<Delta or added assertion>`
- `<Delta or added assertion>`

## Verification

- `<exact command>`
- `<exact command>`
- `<manual check if needed>`

## Open Product Decisions / Blockers

- `<Decision the implementation should not silently lock in>`
- `<Missing dependency, approval, or runtime detail>`

## Do Not Include

- Large pasted excerpts from `AGENTS.md`, `docs/WORKFLOW.md`, `docs/ISSUES_WORKFLOW.md`, or `docs/template/KICKOFF.md`
- Full control-plane essays unless this task introduces a task-specific exception
- Long pasted acceptance-criteria lists or full issue bodies; link the issue and capture delta only
- Reviewer prompt, PR boilerplate, or learning handoff text unless this task is explicitly changing that workflow
- Broad repo summaries unrelated to the files and behavior in scope

## Example (Sanitized, Non-Authoritative)

Use this only as a shape reference. Do not treat it as issue truth.

- Task issue: `#123`
- Task title: `Task: Optional CC on invoice send`
- Source of truth link: `https://github.com/example/repo/issues/123`

### Goal

Allow invoice send flows to accept an optional CC list without changing SMTP providers or the existing primary recipient contract.

### Non-goals

- No provider swap
- No inbox threading changes
- No quote email changes

### Files In Scope

- `backend/app/features/invoices/email_delivery_service.py` - extend send orchestration and validation
- `frontend/src/features/invoices/components/InvoiceDetailScreen.tsx` - pass CC data from the send flow

### Analog Files / Docs

- `docs/analogs/transactional-email-flow.md` - reuse share-before-send and error/ retry rules
- `docs/ARCHITECTURE.md` - keep response and error semantics aligned

### Locked Decisions

- Maximum 5 CC addresses
- Empty CC input is omitted from the payload
- No SMTP or provider configuration change

### Acceptance Criteria Delta

- Preserve existing primary recipient behavior
- Invalid CC addresses return the documented validation error

### Verification

- `make backend-verify`
- `make frontend-verify`

### Open Product Decisions / Blockers

- None
