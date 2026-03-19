# Issues Workflow

This repository uses GitHub issues as the execution control plane.

## Workflow Loop

1. Whiteboard feature ideas in `plans/YYYY-MM-DD/*.md` or spec docs (scratch planning).
2. Document work as issues using one of the execution modes below.
3. Implement and close Task issues via PRs (`Closes #...`).
4. Finalize by updating docs only when behavior/contracts changed and close related Spec/tracker issues.

## Objects

- **Task** (`type:task`): PR-sized implementation unit and default feature issue.
- **Spec** (`type:spec`): feature-set/spec umbrella with decision locks and child Task links.
- **Decision** (`type:decision`): short-term decision lock with rationale.

## Control Plane Rules

1. For issue-backed work (`single`/`gated`), GitHub Issues are the source of truth for execution. `TASKS.md` (if present) is scratchpad only.
2. The default execution path is **1 feature -> 1 Task -> 1 PR**.
3. PRs close Task issues (`Closes #...`), not Specs.
4. Specs close only when all child Tasks are done or explicitly deferred.
5. Tasks are PR-sized; in this workflow PR-sized usually means end-to-end feature delivery.
6. Backend-coupled work requires Decision Locks checked before implementation begins.
7. After major refactors, open one docs-only Task for readability hardening (comments + `docs/PATTERNS.md` updates), with no behavior changes.
8. For `single` and `gated` modes, create a dedicated branch for the Task issue before implementation (for example: `task-123-short-name`).
9. After Task PR creation, run a lean reviewer follow-up pass and return `APPROVED` or `ACTIONABLE`.
10. If scope is a no-contract refactor, include a parity lock checklist in the Task acceptance criteria.
11. For greenfield repos, align issue scope with `GREENFIELD_BLUEPRINT.md` boundaries and structure defaults.

## Execution Modes (Choose Before Opening Issues)

Use `single` by default. Use `gated` or `fast` only when explicitly requested.

### `single` (Default)

Use one Task issue per feature, then one PR that closes it.

- Best for most feature work.
- Task includes mini-spec content: summary/scope/acceptance criteria/verification.
- Decision Locks live in the Task for backend-coupled work.

### `gated` (Spec + Tasks)

Use one Spec issue plus child Task issue(s).

- Use when working a feature set or higher-risk work.
- Decision Locks live in the Spec.
- Child Tasks should stay PR-sized (default one Task per feature).

### `fast` (Quick Fix)

For low-risk maintenance, a direct quick-fix path can be allowed (if project policy allows) without mandatory issue creation when all are true:

- the change is a single logical fix
- no schema/API/realtime contract change
- no auth/security model change
- no migration/dependency changes
- no ADR-worthy architecture decision

When using Fast Lane:

- run relevant verification
- use a clear quick-fix commit message
- follow the repo's branch/merge policy
- if scope grows, switch to `single` or `gated`

## When To Split Into Multiple Tasks

Split only when it clearly improves delivery or risk control:

- change is too large for one PR (guideline: ~600+ LOC or hard to review)
- backend contract should land before frontend integration
- migrations or realtime contract changes increase risk
- parallel work or staged rollout is needed
- a module exceeds file-size thresholds and needs intentional extraction

## Definition Of Ready

A Task is ready when:

- acceptance criteria are explicit
- verification commands are listed
- dependencies/links are included
- runtime/toolchain versions are explicit if verify depends on specific versions
- for backend-coupled work: Decision Locks are checked in the controlling issue (Task in `single`, Spec in `gated`)
- for no-contract refactors: parity lock checklist is explicitly listed in acceptance criteria

## Definition Of Done

A Task is done when:

- PR is merged
- verification commands pass
- tests for the feature are included in the same Task by default
- docs are updated when behavior/contracts changed
- changed code complies with `docs/CODE_COMMENTING_CONTRACT.md`
- follow-up issues are created for deferred work
- reviewer follow-up is complete with verdict and actionable findings addressed or deferred explicitly
- boundary/layer guardrail checks pass when applicable
- no-contract refactors include reported parity lock results (status/shape/error/side-effects)

## Decision Records And ADRs

- Default: Decision Locks live in the controlling issue (Task in `single`, Spec in `gated`).
- Use a separate Decision issue only for non-trivial or cross-Spec discussion.
- If a decision has lasting architecture/security/performance impact:
  - create an ADR in `docs/adr/NNN-slug.md` using `docs/adr/000-template.md` as the format
  - link it from the Spec or Task
  - link it from the implementing PR
- ADR numbering is sequential (`001`, `002`, ...). Use `Accepted` status for active decisions, `Superseded by ADR-NNN` when replaced.
- Write ADRs during the hardening pass or as part of the implementing Task — not retroactively months later when context is lost.

## Verification Template

Use project commands:

```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest && cd ../frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```

Prefer repo-level verify entrypoints when available (for example: `make backend-verify`, `make frontend-verify`).

When a Makefile verify contract exists (see `WORKFLOW.md`), use those canonical targets in Task verification sections.

## Codex + GitHub CLI Playbook

If using Codex in VS Code with GitHub CLI, follow `skills/spec-workflow-gh.md`.

- `mode=single` (default): generate one Task issue body + `gh issue create` command
- `mode=gated`: generate Spec + Task issue body + commands (only when explicitly requested)
- `mode=fast`: generate quick-fix checklist (only when explicitly requested)

### Planning Kickoff Prompt (Feature -> Issue Artifacts)

Use this canonical planning kickoff prompt:

`Run kickoff for feature <feature-id> from <filename> mode=<single|gated|fast>.`

Rules:

- If `mode` is omitted, default to `single`.
- Do not switch to `gated` or `fast` unless explicitly requested.
- This kickoff is planning-only by default: no code changes, no PR creation.
- Output should include: issue body file(s), `gh issue create` command(s) when applicable, created issue link(s), and a 3-5 step implementation plan.
- For `mode=fast`, output a quick-fix checklist and verification plan; no issue creation by default.
- Keep chatter minimal; ask follow-up questions only for hard blockers (auth/permissions/missing required labels).

### Execution Kickoff Prompt (Existing Task)

When a Task issue already exists, use the canonical execution kickoff prompt in `docs/template/KICKOFF.md`:

`Run kickoff for existing Task #<task-id> mode=single.`

Expected behavior:

- restate goal/non-goals/acceptance criteria/verification from the issue
- execute in `single` mode unless explicitly told otherwise
- create/switch to dedicated branch `task-<id>-<slug>` before implementation
- open PR with `Closes #<task-id>`
- return the standardized robust reviewer follow-up prompt

### Resiliency Checkpoints (Lightweight)

Before implementation in `single`/`gated` modes, restate:

- Goal and non-goals
- Files in scope and files explicitly out of scope
- Acceptance criteria and verification commands

Before completion, restate:

- What changed
- What did not change (contracts/behavior)
- Verification results and follow-ups (if any)

## Lean Reviewer Follow-Up (Default)

This review step is intentionally narrow and fast.

Flow:

1. Implementation agent opens PR and provides reviewer prompt.
2. Reviewer inspects major correctness/regression risks and missing tests/docs.
3. Reviewer returns:
   - `APPROVED`, or
   - `ACTIONABLE` with concrete fixes.
4. If `ACTIONABLE`, implementation agent patches and reruns relevant verification only.
5. Run second review pass only if explicitly requested.

Reviewer constraints:

- use local diff/repo context first
- no environment triage loops by default
- no worktree setup by default
- no broad verification reruns already reported green
- no command transcript unless a command failed

Use the exact output contract in `docs/template/KICKOFF.md` (single source of truth).

## Common GitHub CLI Commands

This section is the canonical command snippet source for issue operations.

```bash
gh issue create --title "Task: <feature> end-to-end" --label "type:task,area:frontend" --body-file plans/YYYY-MM-DD/task-<feature>-01.md
gh issue create --title "Spec: <feature set>" --label "type:spec" --body-file plans/YYYY-MM-DD/spec-<feature-set>.md
gh issue list --label type:task
gh issue view <id>
```

## Optional Later

MCP is not required for v1. Add it later only for automation (issue creation/labeling/CI summaries).
