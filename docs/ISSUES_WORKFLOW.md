# Issues Workflow

This repository uses GitHub issues as the execution control plane.

## Workflow Loop

1. Whiteboard feature ideas under `plans/YYYY-MM-DD/` or in spec docs (scratch planning). For a Spec plus multiple Task bodies (and optional Execution Briefs), prefer `plans/YYYY-MM-DD/<workstream-slug>/` with related markdown files co-located; for a single scratch file, `plans/YYYY-MM-DD/<type>-<slug>.md` is enough. See `AGENTS.md` (Agent Operating Loop) for the full convention.
2. Document work as issues using one of the execution modes below.
3. Implement and close Task issues via PRs (`Closes #...`).
4. Finalize by updating docs only when behavior/contracts changed and close related Spec/tracker issues.

## Objects

- **Task** (`type:task`): PR-sized implementation unit and default feature issue.
- **Spec** (`type:spec`): feature-set/spec umbrella with decision locks and child Task links.
- **Decision** (`type:decision`): short-term decision lock with rationale.

## Issue Labels

All issues must include:

- exactly one `type:` label: `type:task`, `type:spec`, or `type:decision`
- `area:` labels from the approved repo taxonomy below

Approved `area:` labels:

- `area:auth`
- `area:profile`
- `area:customers`
- `area:quotes`
- `area:integrations`
- `area:database`
- `area:frontend`
- `area:backend`
- `area:docs`
- `area:tooling`

Label selection rules:

- apply `1-3` `area:` labels per issue
- prefer feature labels first (`area:quotes`) over surface-only labels (`area:backend`)
- add cross-cutting labels only when they materially affect scope
- when using issue templates, add the appropriate `area:` labels before implementation begins
- if required labels do not yet exist in GitHub, create them before opening the issue or treat that as a planning blocker

## Control Plane Rules

1. For issue-backed work (`single`/`gated`), GitHub Issues are the source of truth for execution. `TASKS.md` (if present) is scratchpad only.
2. If a scratch planning file is promoted into a GitHub issue, copy any locked decisions, acceptance criteria, and verification commands into the issue body so the issue remains self-contained.
3. The default execution path is **1 feature -> 1 Task -> 1 PR**.
4. PRs close Task issues (`Closes #...`), not Specs.
5. Specs close only when all child Tasks are done or explicitly deferred.
6. Tasks are PR-sized; in this workflow PR-sized usually means end-to-end feature delivery.
7. Backend-coupled work requires Decision Locks checked before implementation begins.
8. After major refactors, open one docs-only Task for readability hardening (comments + `docs/PATTERNS.md` updates), with no behavior changes.
9. For `single` and `gated` modes, create a dedicated branch for the Task issue before implementation (for example: `task-123-short-name`).
10. After Task PR creation, run a lean reviewer follow-up pass and return `APPROVED` or `ACTIONABLE`.
11. If scope is a no-contract refactor, include a parity lock checklist in the Task acceptance criteria.
12. For greenfield repos, align issue scope with `docs/GREENFIELD_BLUEPRINT.md` boundaries and structure defaults.
13. Parallel local execution is allowed only when each in-flight Task has its own Task issue, its own dedicated branch, disjoint enough scope to review and merge independently, and no unresolved dependency on another in-flight Task.
14. Operator syntax for isolated local execution is `execution=parallel`. This does not change issue lifecycle rules; it only changes how the implementation checkout is created locally.
15. Default safety rule: do not use parallel local execution for migrations, shared API-contract changes, shared state-machine changes, or other tightly coupled backend/state work unless explicitly planned and accepted.

Guiding principle: be strict about scope, contracts, acceptance criteria, verification, and layer boundaries. Be flexible about internal decomposition and helper structure as long as the implementation stays readable, testable, and consistent with repo patterns.

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

## Hardening Pass

After a `gated` spec completes, budget a follow-up hardening task for gaps found during execution. This is expected, not a failure — execution surfaces real issues that planning cannot anticipate (config guardrails, CI alignment, boundary checks, dev tooling). Scope this as a standalone task with its own PR.

## Test Task Scoping

Test-focused tasks must include a **"Do NOT duplicate"** section listing what is already covered by other tasks. This prevents regression test overlap and keeps each test layer focused on its own failure modes.

## Cross-Cutting Infra

Dev tooling, CI fixes, proxy config, and startup scripts that don't fit cleanly in a feature task should be scoped into the task where they are discovered or into the hardening pass. Don't leave them unowned — if the work is needed to make the feature work end-to-end, it belongs in a task.

## When Domain Pass Is Required

Run a Domain Pass (using the `domain-model` skill or the prompt in `docs/template/KICKOFF.md`) before issue creation when any of the following are true:

- the feature introduces a new core noun or overloaded term
- the feature changes lifecycle or state meaning
- the feature crosses backend/frontend/provider boundaries
- the feature affects user-facing business terminology
- the feature creates a new service or module boundary
- the feature is `gated` or otherwise high-risk

Skip it for purely visual polish, isolated bug fixes with stable terminology, and low-risk `fast`-mode maintenance where terminology is unchanged.

Domain Pass output should be reflected in `CONTEXT.md` (resolved terms) and used consistently in issue titles, acceptance criteria, and PR descriptions. Decision Locks should use canonical terms from `CONTEXT.md`.

ADRs remain optional and rare — only create one when the decision is hard to reverse, surprising without context, and the result of a real trade-off.

## Definition Of Ready

A Task is ready when:

- acceptance criteria are explicit and testable
- verification commands are listed and exact
- dependencies/links are included
- runtime/toolchain versions are explicit if verify depends on specific versions
- for backend-coupled work: Decision Locks are checked in the controlling issue (Task in `single`, Spec in `gated`)
- for no-contract refactors: parity lock checklist is explicitly listed in acceptance criteria
- for bug fixes, backend business logic, contract-sensitive behavior, and stateful/cross-layer changes: the first test/assertion to add is identified when practical
- for domain-affecting work: glossary terms are resolved in `CONTEXT.md` or explicitly called out as open questions in the issue

## Definition Of Done

A Task is done when:

- PR is merged
- verification commands pass
- tests for the feature are included in the same Task by default
- targeted tests/assertions for the touched behavior are added when practical; lower-risk UI polish or exploratory work can stay lighter
- docs are updated when behavior/contracts changed
- changed code complies with `docs/CODE_COMMENTING_CONTRACT.md`
- follow-up issues are created for deferred work
- reviewer follow-up is complete with verdict and actionable findings addressed or deferred explicitly
- boundary/layer guardrail checks pass when applicable
- no-contract refactors include reported parity lock results (status/shape/error/side-effects), not just a prose claim
- after explicit reviewer verdict `APPROVED`, the lightweight tutoring handoff is generated once by the approving reviewer in that same chat response; do not create a separate markdown artifact unless explicitly requested

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

When a Makefile verify contract exists (see `docs/workflow/VERIFY.md`), use those canonical targets in Task verification sections.

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
- Immediately before issue-ready markdown / issue creation output, include a short `Why this approach` checkpoint with:
  - chosen approach
  - one rejected alternative
  - main tradeoff
  - assumptions/contracts that must hold
- Output should include: issue body file(s), `gh issue create` command(s) when applicable, created issue link(s), and a 3-5 step implementation plan.
- For `mode=fast`, output a quick-fix checklist and verification plan; no issue creation by default.
- Keep chatter minimal; ask follow-up questions only for hard blockers (auth/permissions/missing required labels).

### Execution Kickoff Prompt (Existing Task)

When a Task issue already exists, use the canonical execution kickoff prompt in `docs/template/KICKOFF.md`:

`Run kickoff for existing Task #<task-id> mode=single.`

Expected behavior:

- restate goal/non-goals/acceptance criteria/verification from the issue
- if an Execution Brief exists, reference it alongside the Task and treat it as the working handoff for task-local deltas only; the Task issue remains authoritative
- execute in `single` mode unless explicitly told otherwise
- create/switch to dedicated branch `task-<id>-<slug>` before implementation
- open PR with `Closes #<task-id>`
- follow the brief-first / analog-aware execution flow and delta-only patch handoff in `docs/template/KICKOFF.md` instead of reprinting stable repo rules in task-local prompts
- return the short reviewer kickoff from `docs/template/KICKOFF.md` section 3a; when full reviewer detail is needed, load section 3b plus `.github/prompts/review-task.prompt.md`

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
4. If `ACTIONABLE`, implementation agent uses the delta-only patch handoff from `docs/template/KICKOFF.md` and reruns relevant verification only unless scope expands.
5. Run second review pass only if explicitly requested.

Reviewer constraints:

- use local diff/repo context first
- no environment triage loops by default
- no worktree setup by default
- no broad verification reruns already reported green
- no command transcript unless a command failed
- be strict about contract drift, acceptance criteria, verification evidence, and layer-boundary violations; be flexible about internal helper structure when the code remains readable, testable, and consistent with repo patterns

Use the exact output contract in `docs/template/KICKOFF.md` (single source of truth).

## Common GitHub CLI Commands

This section is the canonical command snippet source for issue operations.

```bash
# Prefer a workstream folder when you have spec + tasks + briefs:
gh issue create --title "Task: <feature> end-to-end" --label "type:task,area:frontend" --body-file plans/YYYY-MM-DD/<workstream-slug>/task-<feature>-01.md
gh issue create --title "Spec: <feature set>" --label "type:spec" --body-file plans/YYYY-MM-DD/<workstream-slug>/spec-<feature-set>.md
# One-off body file at the day root is still valid:
# --body-file plans/YYYY-MM-DD/task-<feature>-01.md
gh issue list --label type:task
gh issue view <id>
```

## Optional Later

MCP is not required for v1. Add it later only for automation (issue creation/labeling/CI summaries).
