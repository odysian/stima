# WORKFLOW.md — Stima

Stima workflow index: use this file to route into implementation, review, and verification guidance without loading one monolithic workflow doc.

## Project Context

- **Project:** `Stima`
- **Stack:** `FastAPI + SQLAlchemy + Alembic + PostgreSQL + Vite + React + TypeScript + Tailwind CSS v4`
- **Repo layout:** `Feature-first monorepo with backend/ and frontend/ modules`

## Source Of Truth (By Rule Type)

| Rule type | Authoritative source |
| --- | --- |
| Execution control plane (modes, DoR/DoD, branching, issue lifecycle) | `docs/ISSUES_WORKFLOW.md` |
| Product/domain language and glossary | `CONTEXT.md` |
| Domain Pass — when required and how | `docs/ISSUES_WORKFLOW.md` "When Domain Pass Is Required" + `docs/workflow/IMPLEMENT.md` "Domain Pass" |
| Kickoff prompts and reviewer output contract | `docs/template/KICKOFF.md` |
| Implementation-loop guidance | `docs/workflow/IMPLEMENT.md` |
| Review-loop guidance | `docs/workflow/REVIEW.md` |
| Verification tiers and commands | `docs/workflow/VERIFY.md` |

## Workflow Docs

- `docs/workflow/IMPLEMENT.md` - development loop, implementation defaults, hardening, boundaries, parity, scope, and toolchain expectations.
- `docs/workflow/REVIEW.md` - lean review mode, output budget, delta-only patch norms, and learning handoff rules.
- `docs/workflow/VERIFY.md` - verification tiers, canonical `make` targets, command baselines, and agent runtime notes.

## Legacy Section Redirects

This index retains former section names from the monolithic `WORKFLOW.md` and points each to its new canonical location.

## Greenfield Baseline (Default)

Moved to `docs/workflow/IMPLEMENT.md#greenfield-baseline-default`.

## Development Loop

Moved to `docs/workflow/IMPLEMENT.md#development-loop`.

## Agent Output Budget

Moved to `docs/workflow/REVIEW.md#agent-output-budget`.

## Operator Flow Optimization

Moved to `docs/workflow/IMPLEMENT.md#operator-flow-optimization`.

## Optional Parallel Local Execution

Moved to `docs/workflow/IMPLEMENT.md#optional-parallel-local-execution`.

## Issues Workflow (Control Plane)

Moved to `docs/workflow/IMPLEMENT.md#issues-workflow-control-plane`.

## Canonical Kickoff Prompts

Moved to `docs/workflow/IMPLEMENT.md#canonical-kickoff-prompts`.

## Stateful Cross-Layer Hardening Gate

Moved to `docs/workflow/IMPLEMENT.md#stateful-cross-layer-hardening-gate`.

## Boundary And Dependency Rules

Moved to `docs/workflow/IMPLEMENT.md#boundary-and-dependency-rules`.

## Refactor Parity Lock (No Contract Change)

Moved to `docs/workflow/IMPLEMENT.md#refactor-parity-lock-no-contract-change`.

## Lean Review Mode (Default)

Moved to `docs/workflow/REVIEW.md#lean-review-mode-default`.

## Canonical Reviewer Follow-Up Prompt

Moved to `docs/workflow/REVIEW.md#canonical-reviewer-follow-up-prompt`.

## Learning Handoff (Required Completion Gate)

Moved to `docs/workflow/REVIEW.md#learning-handoff-required-completion-gate`.

## Planning And Scope

Moved to `docs/workflow/IMPLEMENT.md#planning-and-scope`.

### Selective Test-First Guidance

Moved to `docs/workflow/IMPLEMENT.md#selective-test-first-guidance`.

### Default Modularity

Moved to `docs/workflow/IMPLEMENT.md#default-modularity`.

### Practical File-Size Budgets

Moved to `docs/workflow/IMPLEMENT.md#practical-file-size-budgets`.

## Decision Brief Requirement

Moved to `docs/workflow/IMPLEMENT.md#decision-brief-requirement`.

## Toolchain Contract (Mandatory)

Moved to `docs/workflow/IMPLEMENT.md#toolchain-contract-mandatory`.

## Verification

Moved to `docs/workflow/VERIFY.md#verification`.

### Verification Tiers

Moved to `docs/workflow/VERIFY.md#verification-tiers`.

### Makefile Verification Contract (Recommended)

Moved to `docs/workflow/VERIFY.md#makefile-verification-contract-recommended`.

### Full Verification

Moved to `docs/workflow/VERIFY.md#full-verification`.

### Frontend Verification

Moved to `docs/workflow/VERIFY.md#frontend-verification`.

### Backend Verification

Moved to `docs/workflow/VERIFY.md#backend-verification`.

### Database Verification

Moved to `docs/workflow/VERIFY.md#database-verification`.

### Verification Baseline Expectations

Moved to `docs/workflow/VERIFY.md#verification-baseline-expectations`.

## Documentation

Moved to `docs/workflow/IMPLEMENT.md#documentation`.

## CI

Moved to `docs/workflow/IMPLEMENT.md#ci`.

## Documentation Layout

Moved to `docs/workflow/IMPLEMENT.md#documentation-layout`.

## Optional Later

Moved to `docs/workflow/IMPLEMENT.md#optional-later`.
