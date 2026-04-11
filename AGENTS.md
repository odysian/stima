# AGENTS.md — Stima

## Start Here (Canonical Entrypoint)

`AGENTS.md` is the canonical entrypoint for agents and contributors in this repository.

Must-read in this order:
1. `AGENTS.md` (this file)
2. `docs/ISSUES_WORKFLOW.md`
3. `docs/template/KICKOFF.md` (if present)
4. `docs/WORKFLOW.md`

Read conditionally (only when relevant):
- `docs/GREENFIELD_BLUEPRINT.md` for greenfield repos or explicit restructuring tasks
- `docs/README.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/PATTERNS.md`, `docs/REVIEW_CHECKLIST.md` for domain/contract/pattern/UI changes
- `skills/*` playbooks only when explicitly requested or clearly required by the task

## Unit of Work Rule

- **Default unit of work is a GitHub Issue.**
- Use `single` mode by default: one feature -> one Task issue -> one PR.
- Use `gated` or `fast` only when the user explicitly requests it.
- In `fast` mode, no issue creation is required (per `docs/ISSUES_WORKFLOW.md` criteria).
- Convert freeform requests into the selected issue mode before implementation.
- For issue-backed work, work one Task issue at a time.
- PRs close Task issues (`Closes #123`), not Specs.
- Specs close only when all child Tasks are done or explicitly deferred.
- Detailed control-plane rules are canonical in `docs/ISSUES_WORKFLOW.md`.
- For one-shot issue body + `gh` command generation, use `skills/spec-workflow-gh.md`.
- Canonical kickoff types:
  - Planning kickoff (issue planning only): `Run kickoff for feature <feature-id> from <filename> mode=<single|gated|fast>, planning-only (no code changes, no PR).`
  - Execution kickoff (implementation): `Run kickoff for existing Task #<task-id> mode=single.`
  - Execution kickoff (isolated parallel local execution): `Run kickoff for existing Task #<task-id> mode=single execution=parallel.`
  - If an Execution Brief exists, reference it after the Task prompt and use it as the working handoff; the GitHub Task issue remains authoritative.
  - If `mode` is omitted, default to `single`.
  - Do not switch to `gated` or `fast` unless explicitly requested.
  - Planning kickoff output: issue body file(s), `gh issue create` command(s) when applicable, created issue link(s), and a 3-5 step implementation plan.
  - Execution kickoff output: implementation + verification + PR + short reviewer kickoff (`docs/template/KICKOFF.md` section 3a) + final completion after explicit `APPROVED`, with the lightweight tutoring handoff generated once by the approving reviewer in that same response.
  - Use `docs/template/KICKOFF.md` for the exact brief-first execution, delta-only patch, and reviewer prompt wording instead of restating stable repo rules in task-local prompts.

## Agent Operating Loop

1. Whiteboard scope under `plans/YYYY-MM-DD/` or in spec docs (scratch only). Many operators keep `plans/` uncommitted or sparse-commit to avoid bloating the remote; treat paths as local working artifacts unless you explicitly commit them.
   - **Multi-artifact workstreams** (Spec + child Task bodies + optional Execution Briefs / kickoff scratch): use one folder per workstream, e.g. `plans/YYYY-MM-DD/<workstream-slug>/`, and keep `spec-*.md`, `task-*.md`, and brief files (e.g. `brief-<task-slug>.md` or `execution-brief-<task-slug>.md`) together. Use a stable hyphenated `workstream-slug` so `--body-file` paths stay copy-pasteable.
   - **One-off scratch** (single note or one draft task body): a flat file `plans/YYYY-MM-DD/<type>-<slug>.md` is fine.
2. Choose execution mode and create required issue(s) (`single` unless explicitly asked for `gated`/`fast`; `fast` can skip issue creation).
3. Restate goal and acceptance criteria.
4. Plan minimal files and scope.
5. Implement with tight, surgical changes.
6. Run verification commands once (or once per code change set).
7. For issue-backed work, open PR that closes the Task issue; close Spec after child Tasks are done/deferred.
8. Provide the short reviewer kickoff (`docs/template/KICKOFF.md` section 3a) for a separate review pass; paste the full section 3b brief only if the operator explicitly requests it.
9. Patch only actionable findings, rerun relevant verification, and repeat review only if explicitly requested.
10. After explicit reviewer verdict `APPROVED`, finalize the Task or Spec; do not generate a second lightweight tutoring handoff after approval is relayed back.
11. Finalize: return the completion output and then close/complete the Task or Spec as applicable.

## Project Context

- **Project:** `Stima`
- **Stack:** `FastAPI + SQLAlchemy + Alembic + PostgreSQL + Vite + React + TypeScript + Tailwind CSS v4`
- **Repo layout:** `Feature-first monorepo with backend/ and frontend/ modules`

## Operating Rules

- Do not add co-author attribution to commits or PRs. Do not append `Co-Authored-By:` trailers, AI attribution lines, or any agent/tool credit to commit messages or PR descriptions.
- Keep solutions simple and explicit.
- Make surgical changes only.
- Match existing style and conventions.
- Use SQLAlchemy 2.0 style only in backend code (`Mapped`/`mapped_column`, `select()` + async session methods). Do not use SQLAlchemy 1.x `Column()` model style or `db.query(...)`.
- Follow `docs/CODE_COMMENTING_CONTRACT.md` for in-code comment/docstring standards.
- Do not install dependencies without approval.
- Do not change unrelated files.
- Do not modify applied migrations; create a new migration.
- Keep code review lean: focus on major bugs/regressions and missing tests.
- In review mode, avoid environment triage loops, worktree setup, and repeated full-suite verification unless a blocker requires it.
- For no-contract refactors, use the parity lock checklist (status/shape/error/side-effects) before merge.
- Keep runtime/toolchain contracts explicit and consistent across README, local verify commands, and CI.
- For bug fixes, backend business logic, contract-sensitive behavior, and stateful/cross-layer changes, identify the test/assertion to add first when practical. This is guidance for higher-risk work, not strict TDD.

## Codebase Modularity Defaults

- Default for greenfield repos: follow `docs/GREENFIELD_BLUEPRINT.md`.
- Backend layering default: `api -> services -> repositories -> integrations/libs`.
- Frontend layering default: `src/app` route shells + `src/features/<feature>` + `src/shared`.
- Keep feature boundaries explicit: feature internals stay private; cross-feature usage should go through public exports.
- If a repo already uses a different structure, preserve it unless a dedicated migration task explicitly scopes restructuring.
- Practical file-size budgets:
  - frontend components target `<=250` LOC
  - frontend hooks/services target `<=180` LOC
  - backend route/service/repository modules target `<=220` LOC
  - split or create linked follow-up when any frontend module exceeds `450/300` LOC (component vs hook/service) or backend route/service/repository exceeds `350` LOC

## Parallel Local Execution (Optional)

Use only when the operator explicitly requests `execution=parallel`.

- `mode` still controls the issue workflow (`single`, `gated`, `fast`).
- `execution=parallel` controls local implementation isolation only.

Rules:
- one Task issue -> one branch -> one worktree -> one PR
- run `scripts/worktree-init.sh <task-id> [slug]` before any code changes; use the printed `WORKTREE_READY` path as the working directory
- never use `git worktree add --force`
- if the branch or worktree path already exists, stop and report instead of improvising
- keep the main checkout as the control-plane workspace (planning, review coordination, merge, post-merge sync)
- do not default to parallel execution for migrations, shared API-contract changes, auth/state-machine changes, or other tightly coupled backend/stateful work unless explicitly planned

## Decision Brief (Conditional)

For non-trivial fixes/features, include a short decision brief only when behavior/contracts/architecture decisions changed:

- **Chosen approach:** what was implemented.
- **Alternative considered:** one realistic alternative.
- **Tradeoff:** why this choice won (complexity/risk/perf/security).
- **Revisit trigger:** when the alternative should be reconsidered.

For tiny quick fixes with no contract change, decision brief is optional.

## Workflow Order

1. Read `docs/ISSUES_WORKFLOW.md`
2. Read `docs/template/KICKOFF.md`
3. Read `docs/WORKFLOW.md`
4. Read `docs/GREENFIELD_BLUEPRINT.md` only for greenfield/restructure tasks
5. Read project docs in `docs/README.md, docs/ARCHITECTURE.md, docs/PATTERNS.md, docs/REVIEW_CHECKLIST.md` only when needed for touched scope
6. Execute one ready Task issue

## Reviewer Handoff Contract

After implementation PR is open, the implementation agent provides a reviewer prompt containing:

- Task/PR identifier and branch/base
- verification already run
- explicit request for `APPROVED` or `ACTIONABLE`

Reviewer pass default constraints:

- use local diff context first
- no broad environment triage by default
- no worktree creation by default
- no rerun of broad verification already reported green
- no command transcript in output unless a command failed
- default to one review pass; run a second pass only if the user explicitly requests it
- if verdict is `APPROVED`, the approving reviewer ends that same response with the lightweight tutoring handoff, generated once

Default: paste only the short reviewer kickoff from `docs/template/KICKOFF.md` section 3a (plus verification summary). Reviewer output shape and constraints are defined in section 3b; use the full section 3b inline copy only when the operator requests it or the reviewer lacks repo access.

## Learning Handoff Contract

Required completion gate:

- Post a learning handoff whenever a Task is finished and whenever a Spec is closed.
- The lightweight tutoring handoff is generated once, by the approving reviewer, in the same `APPROVED` response.
- Do not generate a second learning handoff after approval is relayed back; the implementation agent finalizes after approval.
- Post it directly in the same chat/thread; do not create a separate markdown handoff unless explicitly requested.
- Keep it brief, tutor-style, and practical rather than archival.
- Required shape:
  - 4 short bullets covering:
    - what changed
    - why it was done this way
    - one tradeoff or pattern worth learning
    - what to review first
  - 3-6 code pointers using `path:line-line — why it matters` format

## Verification

### Agent Runtime Note

- Do **not** run `make db-verify` from agent sessions. It can hang/long-run in this environment and block execution.
- Do **not** run `make extraction-live` from agent sessions. If live validation is needed, request the human operator to run it manually and share the output.
- For Task verification in agent runs, use `make backend-verify` and/or `make frontend-verify` per issue scope.
- Do **not** run bare `pytest` from agent sessions. For targeted backend tests, use `cd backend && .venv/bin/pytest ...` so the repo venv is always used.
- Backend pytest in this repo depends on host-local services configured by `backend/conftest.py` (for example the local Postgres test DB). If backend tests are required for the task, request escalated permissions and run them outside the sandbox instead of retrying inside the network-isolated sandbox.
- If a sandboxed backend pytest run hangs before reaching assertions or during startup/collection, suspect sandbox-to-local-service access before assuming an application bug.
- Only run DB migration verification when explicitly requested by a human operator outside agent flow.

### Full

```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest && cd ../frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```

### Frontend

```bash
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```

### Backend

```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest
```

### DB

```bash
cd backend && alembic upgrade head
```

If the repo defines a Makefile verification contract, prefer canonical `make` targets (for example: `make verify`, `make backend-verify`, `make frontend-verify`) over ad-hoc command variants.

## Documentation Discipline

Treat doc updates like failing tests. Keep architecture, patterns, checklists, and ADRs current.

## Skills Note

`skills/*.md` are portable procedural playbooks unless your runtime explicitly loads them.

## Skill Governance

Keep external skills high-signal and conflict-free:

- Rule ownership:
  - execution control plane (modes/DoR/DoD/branching): `docs/ISSUES_WORKFLOW.md` (authoritative)
  - kickoff and reviewer output contract: `docs/template/KICKOFF.md` (authoritative)
  - implementation loop and quality defaults: `docs/WORKFLOW.md`
  - onboarding and operating constraints: `AGENTS.md`
- For skills, precedence order is: repo docs above -> local `skills/*` -> external installed skills.
- Install external skills globally in Codex home, not inside project repos.
- Keep a small baseline (about 4-6 active external skills).
- Use skills intentionally (named skill or clear task match), not by default for every request.
- Avoid overlap: keep one primary skill per domain (API design, DB design, security, TypeScript).
- If an external skill conflicts with repo docs, follow repo docs and treat the skill as advisory.
- Review and prune unused or low-value skills regularly.

## Optional Later

MCP is out of scope for v1. It can be added later to automate issue creation/labeling/CI summaries.
