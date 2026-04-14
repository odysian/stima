# Workflow: Implement

Implementation-loop guidance and engineering defaults for task execution.

## Greenfield Baseline (Default)

For new repositories, use `docs/GREENFIELD_BLUEPRINT.md` as the baseline.

Core defaults:

- Backend structure: feature-first modules with explicit layering `api -> services -> repositories -> integrations/libs`.
- Frontend structure: feature-first under `src/features/<feature>` with shared modules in `src/shared`.
- Route/page modules stay thin; orchestration belongs in services/hooks.
- No-contract refactors must pass the parity lock checklist.
- Runtime/toolchain contracts are explicit and pinned.

## Development Loop

Every feature follows:

1. Whiteboard
2. Document
3. Implement
4. Verify
5. Review handoff
6. Patch (if needed)
7. In-chat learning handoff in the approving review response
8. Finalize

## Operator Flow Optimization

Use this as the default human-in-the-loop sequence to reduce handoff overhead:

1. Plan scope and choose mode (`single` by default; `gated`/`fast` only when explicitly requested).
2. For issue-backed work (`single`/`gated`), use the brief-first execution flow in `docs/template/KICKOFF.md`: keep the Task issue authoritative, add an Execution Brief only for task-local deltas, and reference analog docs when relevant.
3. Open PR with `Closes #<task-id>`.
4. Run one reviewer pass: implementation agent posts the short kickoff from `docs/template/KICKOFF.md` section 3a; reviewer follows section 3b for scope/output shape and loads `.github/prompts/review-task.prompt.md` when the full brief is needed.
5. If verdict is `ACTIONABLE`, use the delta-only patch handoff from `docs/template/KICKOFF.md` and rerun targeted verification only unless scope expands.
6. When verdict is `APPROVED`, the approving reviewer includes the lightweight tutoring handoff in that same response; the implementation agent then finalizes without generating a second handoff.
7. Merge PR and sync local branch.
8. If this Task belongs to a Spec, check whether all sibling Tasks are now done or deferred; if so, close the Spec issue.

## Optional Parallel Local Execution

For independent Task issues, the operator may request isolated local execution:

```text
Run kickoff for existing Task #<id> mode=single execution=parallel.
```

This is a local checkout strategy, not a new issue workflow mode.

Rules:
- GitHub issues remain the execution source of truth
- the main checkout is the control-plane workspace
- each parallel Task gets its own dedicated branch and linked worktree via `scripts/worktree-init.sh`
- reviewers use the PR diff / branch diff as the entrypoint; they do not create worktrees
- do not use parallel execution by default for migrations, shared contracts, or tightly coupled stateful work

Post-merge cleanup (operator, in the main checkout):
```bash
git worktree remove --force ../stima-wt/task-<id>-<slug>
git branch -d task-<id>-<slug>
git fetch --prune origin
```

## Issues Workflow (Control Plane)

Use `AGENTS.md` bootstrap paths to decide when `docs/ISSUES_WORKFLOW.md` must be loaded. It is required for planning, issue creation, mode/lifecycle decisions, and any control-plane uncertainty.

Core rule:

- GitHub issues are the execution source of truth.
- Choose execution mode: `single` by default; use `gated` or `fast` only when explicitly requested.
- Default sizing is 1 feature -> 1 Task -> 1 PR unless split criteria apply.
- PRs close Tasks.
- Specs close only when all child Tasks are done or deferred.
- For `single` and `gated` modes, create a dedicated Task branch before implementation.
- Backend-coupled work must have Decision Locks checked before implementation.
- After major refactors, open one docs-only Task for readability hardening (comments + `docs/PATTERNS.md` updates), with no behavior changes.

Definition of Ready and Definition of Done are defined in `docs/ISSUES_WORKFLOW.md` and are mandatory gates.

## Canonical Kickoff Prompts

Use `docs/template/KICKOFF.md` for copy-paste kickoff prompts.

- Planning kickoff (feature -> issue planning only): no code changes, no PR.
- Execution kickoff (existing Task -> implement/verify/PR): run only when Task issue already exists.

## Stateful Cross-Layer Hardening Gate

For Tasks that touch any of the following:
- state transitions or lifecycle/status machines
- frontend action visibility/enabled-state logic
- external provider side effects
- transport/error semantics or contract-sensitive behavior

run one explicit hardening pass before reviewer handoff.

Hardening pass checklist:
- Behavior matrix matches implementation across all affected states
- UI action matrix matches intended enabled/disabled/hidden behavior
- Success, error, and retry semantics are aligned across backend, frontend, and docs
- Failure paths are checked explicitly (for example provider failure, persistence failure, rollback/fallback behavior)
- Canonical verification target(s) for the touched scope pass before push

If canonical verification is blocked locally, stop and report that clearly before pushing follow-up fixes.
Do not rely on confidence or partial checks when the Task changes contract-sensitive or stateful behavior.

## Boundary And Dependency Rules

- Be strict about scope, contracts, acceptance criteria, verification, and layer boundaries. Be flexible about internal decomposition and helper structure as long as the implementation stays readable, testable, and consistent with repo patterns.
- Allowed: `api -> services -> repositories -> integrations/libs`.
- Disallowed: reverse imports or cross-layer shortcuts.
- Public service functions must add value (orchestration, policy, validation, transactions), not argument pass-through.
- Repositories own persistence/query logic only and should not raise transport-layer errors.
- Enforce boundary direction with lightweight guardrail checks/tests where possible.

## Refactor Parity Lock (No Contract Change)

If a Task claims "no API/contract change", verify and report:

1. Status code parity (success + error paths).
2. Response schema parity (fields/types/envelope shape).
3. Error semantics parity (externally visible behavior).
4. Side-effect parity (DB writes, queue, storage, notifications).

## Planning And Scope

- One issue at a time.
- Default to one end-to-end Task per feature.
- Keep changes surgical.
- Split Tasks only when `docs/ISSUES_WORKFLOW.md` split criteria apply.

### Selective Test-First Guidance

- When practical, bug fixes, backend business logic, contract-sensitive behavior, and stateful/cross-layer changes should identify the first test or assertion to add before implementation.
- This is not full TDD and does not require red-green-refactor for every task.
- UI polish, exploratory work, copy tweaks, and other low-risk changes can stay lighter when the risk profile does not justify front-loading tests.

### Default Modularity

- Frontend greenfield default: `src/features/<feature>/*` plus `src/shared/*`.
- Backend greenfield default: `backend/app/features/<feature>/*` with explicit api/service/repository boundaries.
- For existing repos, preserve current structure unless a dedicated migration task scopes restructuring.

### Practical File-Size Budgets

- Frontend leaf components: target `<=250` LOC.
- Frontend single-purpose hooks/services: target `<=180` LOC.
- Backend route/service/repository modules: target `<=220` LOC.
- `300-400` LOC can be acceptable when cohesive; split or create linked follow-up when:
  - frontend component exceeds `450` LOC
  - frontend hook/service exceeds `300` LOC
  - backend route/service/repository exceeds `350` LOC

## Decision Brief Requirement

For non-trivial changes that modify behavior/contracts/architecture, include a short decision brief:

- chosen approach
- one alternative considered
- tradeoff behind the choice (complexity/risk/perf/security)
- revisit trigger for when the alternative becomes preferable

For small tasks with no contract/behavior change, decision brief is optional.

## Toolchain Contract (Mandatory)

- Pin runtime versions in-repo (for example `.nvmrc`, `.python-version`, or equivalent).
- Declare Node requirements in `package.json` `engines` when frontend tooling depends on specific Node versions.
- Keep README prerequisites, local verify commands, and CI runtime versions aligned.
- Verification should fail fast on version mismatch.

## Documentation

Update docs only when behavior/contracts/patterns changed.

For in-code documentation and comment quality requirements, follow `docs/CODE_COMMENTING_CONTRACT.md`.

Docs paths:

- `docs/README.md, docs/ARCHITECTURE.md, docs/PATTERNS.md, docs/REVIEW_CHECKLIST.md`

## CI

- `GitHub Actions: .github/workflows/backend-test.yml and .github/workflows/frontend-test.yml`

## Documentation Layout

- `docs/`: `WORKFLOW.md`, `workflow/IMPLEMENT.md`, `workflow/REVIEW.md`, `workflow/VERIFY.md`, `ISSUES_WORKFLOW.md`, `GREENFIELD_BLUEPRINT.md`, `MIGRATION_GUIDE.md`, `ARCHITECTURE.md`, `PATTERNS.md`, `REVIEW_CHECKLIST.md`, ADRs, runbooks.

## Optional Later

- `MCP support` may be added after v1 if automation needs justify the added surface area.
