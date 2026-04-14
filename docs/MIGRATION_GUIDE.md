# Migration Guide

This guide explains how to use this template as the foundation for a new project and how to adopt it in an existing repo.

## What this template provides

- Agent operating rules (`AGENTS.md`)
- Core workflow index (`docs/WORKFLOW.md`)
- Split workflow guides (`docs/workflow/IMPLEMENT.md`, `docs/workflow/REVIEW.md`, `docs/workflow/VERIFY.md`)
- Issue-driven execution control plane (`docs/ISSUES_WORKFLOW.md`)
- Canonical kickoff/review prompts (`docs/template/KICKOFF.md`)
- Documentation skeletons (`docs/ARCHITECTURE.md`, `docs/PATTERNS.md`, `docs/REVIEW_CHECKLIST.md`)
- GitHub issue templates and PR template (`.github/`)
- Portable playbooks in `skills/`

## Part 1: New Project Setup (recommended)

1. Create a new repo from this template repository.
2. Replace all token placeholders before implementation: `Stima`, `FastAPI + SQLAlchemy + Alembic + PostgreSQL + Vite + React + TypeScript + Tailwind CSS v4`, `Feature-first monorepo with backend/ and frontend/ modules`, `cd backend && ruff check . && mypy . && bandit -r app/ && pytest && cd ../frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build`, `cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build`, `cd backend && ruff check . && mypy . && bandit -r app/ && pytest`, `cd backend && alembic upgrade head`, `docs/README.md, docs/ARCHITECTURE.md, docs/PATTERNS.md, docs/REVIEW_CHECKLIST.md`, `GitHub Actions: .github/workflows/backend-test.yml and .github/workflows/frontend-test.yml`.
3. Confirm verification commands run locally.
4. Configure GitHub labels and board.
5. Start with a Task issue by default (`single` mode); use Spec + Tasks only when scope/risk requires `gated` mode.

## Part 2: Existing Project Adoption

1. Copy the template files into the existing repo.
2. Merge carefully with existing docs (do not overwrite project-specific rules).
3. Reconcile contradictions first (verification commands, auth pattern statements, test plan claims).
4. Decide source of truth: for issue-backed work (`single`/`gated`), GitHub Issues = execution control plane, `TASKS.md` = optional scratchpad only.
5. Roll out in two phases: Phase A = docs/templates only, Phase B = enforce in active work (`Task -> PR` by default; `Spec -> Task -> PR` when needed).
6. Set review policy to lean follow-up by default: implementation agent provides the short reviewer kickoff (`docs/template/KICKOFF.md` section 3a) after PR creation, reviewer returns only `APPROVED` or `ACTIONABLE` per section 3b, and reviewer avoids environment triage/worktree/broad verify reruns.
7. Keep execution mode defaults strict: default to `single`; use `gated`/`fast` only when explicitly requested.
8. Keep ceremony conditional: second review pass only when explicitly requested; decision briefs and doc updates only when behavior/contracts/architecture changed.

Recommended onboarding paths for agents:
1. Implement existing Task: `AGENTS.md` -> Task/Execution Brief/PR context -> `docs/template/KICKOFF.md` section 1 -> relevant `docs/workflow/IMPLEMENT.md` + `docs/workflow/VERIFY.md` sections only as needed.
2. Review PR: `AGENTS.md` -> PR/Task context -> `docs/template/KICKOFF.md` section 3a (and 3b constraints) -> `.github/prompts/review-task.prompt.md` only when full prompt body is needed.
3. Plan/create issues/choose mode: `AGENTS.md` -> `docs/ISSUES_WORKFLOW.md` -> `docs/template/KICKOFF.md` section 2.
4. Escape hatch: if mode/labels/lifecycle/branching are unclear in any path, read `docs/ISSUES_WORKFLOW.md` before proceeding.

Kickoff split:
- Planning kickoff (`feature -> issue artifacts`) is planning-only: no code changes, no PR.
- Execution kickoff (`existing Task -> implementation`) performs branch/implement/verify/PR flow.

## Definition of Ready and Done

Use `docs/ISSUES_WORKFLOW.md` as the authoritative gate for:

- Definition of Ready (DoR)
- Definition of Done (DoD)

No implementation should begin for backend-coupled work until Decision Locks are checked.

## ADR Rule

Use Decision issues/checkboxes for short-term locking.
If a decision has lasting architecture/security/performance impact, create an ADR (`NNN-*.md`) and link it from the Spec and PR.

## Optional Later: MCP

MCP is intentionally out of scope for v1.
Add MCP later only if you want automation for issue creation/labeling/CI summaries.

## Suggested Release Discipline for this template repo

1. Tag versions (`v0.1.0`, `v0.2.0`, ...).
2. Keep a short changelog or release notes.
3. In downstream repos, record which template version they started from.
