# WORKFLOW.md — Stima

## Project Context

- **Project:** `Stima`
- **Stack:** `FastAPI + SQLAlchemy + Alembic + PostgreSQL + Vite + React + TypeScript + Tailwind CSS v4`
- **Repo layout:** `Feature-first monorepo with backend/ and frontend/ modules`

## Source Of Truth (By Rule Type)

- Execution control plane (modes, DoR/DoD, branching, issue lifecycle): `docs/ISSUES_WORKFLOW.md` (authoritative)
- Kickoff prompts and reviewer output contract: `docs/template/KICKOFF.md` (authoritative)
- This file (`WORKFLOW.md`) summarizes the implementation loop and engineering defaults.

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
4. Run one reviewer pass: implementation agent posts the short kickoff from `docs/template/KICKOFF.md` section 3a; reviewer follows section 3b for scope and output shape (or uses the section 3b inline copy when requested).
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
git worktree remove ../stima-wt/task-<id>-<slug>
git branch -d task-<id>-<slug>
git fetch --prune origin
```

## Issues Workflow (Control Plane)

Read `docs/ISSUES_WORKFLOW.md` before implementation.

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

## Lean Review Mode (Default)

After implementation and PR creation, run one focused reviewer follow-up pass:

- Reviewer scope: major correctness bugs, regressions, and missing tests/docs.
- Reviewer output: `APPROVED` or `ACTIONABLE`.
- If `ACTIONABLE`, patch findings and rerun only relevant verification.
- If `APPROVED`, the approving reviewer posts the required in-chat learning handoff in that same response before the implementation agent claims completion.
- Default to one review pass; run a second pass only when explicitly requested.

Default reviewer constraints:

- use local branch diff/repo context first
- skip broad environment triage unless blocked
- do not create worktrees by default
- do not rerun full verification already reported green
- report findings first; no command-by-command transcript unless a command failed
- be strict about contracts, boundary violations, verification gaps, and parity claims; do not nitpick internal helper decomposition when readability, testability, and repo-pattern consistency are intact

Reviewer note for stateful/cross-layer Tasks:
- default to matrix/parity review first:
  - status/action parity
  - error/detail parity
  - side-effect parity
  - failure/retry parity
- separate correctness defects from product decisions that should become follow-up tasks

## Canonical Reviewer Follow-Up Prompt

After opening a Task PR, default to the short reviewer kickoff in `docs/template/KICKOFF.md` section 3a. Section 3b there is the full inline brief and the authoritative output contract; paste it only when the operator asks or the reviewer lacks repo context.
Do not redefine the format in this file; keep `docs/template/KICKOFF.md` as the single source of truth.

## Learning Handoff (Required Completion Gate)

The lightweight tutoring handoff is generated once, by the approving reviewer, in the same `APPROVED` response for the completed unit (`Task` completion and `Spec` closure).

- Do not generate a second learning handoff after approval is relayed back; the implementation agent finalizes after approval.
- Do not create a separate markdown handoff unless explicitly requested.
- Keep it ephemeral and practical, not archival documentation.
- Keep it to 4 short bullets:
  - what changed
  - why it was done this way
  - one tradeoff or pattern worth learning
  - what to review first
- Add 3-6 code pointers using `path:line-line — why it matters` format.

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

## Verification

Run the relevant checks before claiming completion.

Agent execution note:
- Do not run live/provider-backed verification targets from agent sessions (for example `make extraction-live`); ask the human operator to run them manually and share output.
- Do not run bare `pytest` from agent sessions. Use `make backend-verify` for broad backend verification, or `cd backend && .venv/bin/pytest ...` for targeted backend tests so the repo venv is used consistently.
- Backend pytest depends on host-local services in this repo's test harness (see `backend/conftest.py`). When backend tests are needed from an agent session, prefer an escalated run outside the sandbox over repeated retries inside the network-isolated sandbox.
- If sandboxed backend pytest hangs during startup, collection, or before first assertion, treat sandbox/service access as the default suspect and verify that path before debugging application code.

### Makefile Verification Contract (Recommended)

If the repo uses `make` for verification, standardize on these targets:

- `make verify` (full verification aggregator)
- `make backend-verify` (backend lint/type-check/tests/security checks as applicable)
- `make frontend-verify` (frontend type-check/tests/lint/build as applicable)
- `make db-verify` (migrations/schema checks when applicable)
- `make template-verify` (template-level checks such as unresolved-token guard)

Contract rules:

- Targets must be deterministic, non-interactive, and fail-fast (non-zero exit on failure).
- CI should run the same `make` targets used locally.
- Keep target names and scope stable; if changed, update README + workflow docs in the same Task.

### Full Verification

```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest && cd ../frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```

### Frontend Verification

```bash
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```

### Backend Verification

```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest
```

### Database Verification

```bash
cd backend && alembic upgrade head
```

### Verification Baseline Expectations

- Backend: boundary guardrail check + lint + type-check + tests + security scan.
- Frontend: type-check + tests + lint + production build.
- No-contract refactors: include parity lock results in final verification summary.
- Template maintenance: unresolved-token guard passes (`./scripts/check-unresolved-template-tokens.sh`).

## Documentation

Update docs only when behavior/contracts/patterns changed.

For in-code documentation and comment quality requirements, follow `docs/CODE_COMMENTING_CONTRACT.md`.

Docs paths:

- `docs/README.md, docs/ARCHITECTURE.md, docs/PATTERNS.md, docs/REVIEW_CHECKLIST.md`

## CI

- `GitHub Actions: .github/workflows/backend-test.yml and .github/workflows/frontend-test.yml`

## Documentation Layout

Root stays lean — only agent/Claude entrypoints:

- Root: `AGENTS.md`, `CLAUDE.md`.
- `docs/`: `WORKFLOW.md`, `ISSUES_WORKFLOW.md`, `GREENFIELD_BLUEPRINT.md`, `MIGRATION_GUIDE.md`, `ARCHITECTURE.md`, `PATTERNS.md`, `REVIEW_CHECKLIST.md`, ADRs, runbooks.
- `skills/`: procedural playbooks only.

## Optional Later

MCP is optional and not part of v1. Introduce it only when you need automation for issue operations or CI summaries.
