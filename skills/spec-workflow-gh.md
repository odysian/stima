# Playbook: Spec Workflow (Codex + GitHub CLI)

Use this playbook for planning kickoffs that generate issue artifacts with low overhead.

## Canonical Kickoff Types

### 1) Planning kickoff (feature -> issue artifacts only)

`Run kickoff for feature <feature-id> from <filename> mode=<single|gated|fast>.`

Interpretation:

- if `mode` is omitted, use `single`
- keep `single` unless `gated` or `fast` is explicitly requested
- planning-only: no code changes, no PR creation
- source content from the requested feature section in `<filename>`

### 2) Execution kickoff (existing Task -> implementation)

`Run kickoff for existing Task #<task-id> mode=single.`

Execution kickoff is handled by `docs/template/KICKOFF.md`.

## Planning Inputs

- Feature identifier/title
- Mode: `single` (default); use `gated`/`fast` only when explicitly requested
- Spec link/section (optional)
- Area labels (optional)

## Planning Output Requirements

1. `mode=single` (default):
- one Task markdown body for end-to-end implementation
- one `gh issue create` command for the Task
2. `mode=gated`:
- one Spec markdown body + one default Task body
- optional 0-2 extra Task bodies only when split criteria apply, with rationale
- `gh issue create` commands for Spec + Task issue(s)
3. `mode=fast`:
- quick-fix checklist (scope, verify commands, commit message)
- no issue commands by default
4. Task bodies include:
- suggested labels
- acceptance criteria with backend/frontend/tests/docs checkboxes
- `Parent Spec: (placeholder)` only in `mode=gated`
5. Planning response includes:
- files written
- created issue link(s), when applicable
- exact `gh issue create` command(s), when applicable
- concise 3-5 step implementation plan

## Procedure

### Planning Automation Defaults (No-Chatter)

When planning shorthand is used, default to this non-interactive behavior:

1. Keep current branch (planning-only behavior).
2. Do not run preflight discovery commands by default (`gh auth status`, `gh label list`, broad repo scans).
3. Write issue body file(s) under `plans/`:
- `plans/task-<feature-slug>-01.md` (`single`)
- `plans/spec-<feature-slug>.md` + `plans/task-<feature-slug>-01.md` (`gated`)
4. Run `gh issue create` directly for `single`/`gated` unless blocked by auth/permissions/missing required labels.
5. Ask follow-up questions only for hard blockers.

### A) Draft issue body content

- choose mode from criteria in `docs/ISSUES_WORKFLOW.md`
- for `single`: generate one end-to-end Task body
- for `gated`: generate Spec + one default Task body
- add optional split Tasks only when split criteria are met
- include labels and acceptance criteria
- include `Parent Spec: (placeholder)` only for gated child Tasks

### B) Generate GitHub CLI commands

- mode-specific filenames:
  - `plans/task-<feature>-01.md` (`single`)
  - `plans/spec-<feature>.md` + `plans/task-<feature>-01.md` (`gated`)
- mode-specific `gh issue create` commands using `--body-file` and `--label`

### C) Execute planned Task (separate kickoff)

After issue creation, run the execution kickoff from `docs/template/KICKOFF.md`.
Execution must create/switch to dedicated branch `task-<id>-<slug>` before implementation.

## Common GitHub CLI Snippets

Use the canonical command examples in `docs/ISSUES_WORKFLOW.md` under `Common GitHub CLI Commands`.
Do not duplicate command blocks in this playbook.
