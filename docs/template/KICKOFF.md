# Kickoff Prompts

Use these prompts to start work on already-scoped tasks without reloading unnecessary instruction text.

## Types

- Execute existing Task issue
- Planning-only kickoff
- Reviewer follow-up after Task PR
- Delta-only patch handoff after `ACTIONABLE`

## Defaults

- Task issue remains authoritative.
- Execution Brief is task-local compression only.
- Use the short reviewer kickoff by default.
- After `ACTIONABLE`, patch listed findings only unless scope expands.
- Verification follows tiers from `docs/workflow/VERIFY.md`.
- For backend code changes, run the targeted behavior check plus `make backend-static-verify` before push/PR update.

## When To Load Which Asset

| Situation | Load |
| --- | --- |
| Implement existing Task | `docs/template/KICKOFF.md` section 1 |
| Planning-only kickoff | `docs/template/KICKOFF.md` section 2 |
| Request review after opening PR | `docs/template/KICKOFF.md` section 3a |
| Full reviewer brief needed | `.github/prompts/review-task.prompt.md` |
| Patch after `ACTIONABLE` | `docs/template/KICKOFF.md` Delta-Only Patch Handoff |
| Approving handoff format | `docs/template/KICKOFF.md` section 4 |

## 1) Execute Existing Task Issue

```text
Run kickoff for existing Task #<task-id> mode=single.

Reference <execution-brief-filepath>  # when present
Reference <analog-filepath>  # when relevant

Then execute the full Task flow end-to-end:
1. Restate goal, non-goals, acceptance criteria, and verification commands from the Task issue.
2. Branch/checkout setup:
   - default: create/switch to `task-<id>-<slug>`
   - `execution=parallel`: run `scripts/worktree-init.sh <task-id> [slug]`, use returned `WORKTREE_READY` path only, and verify `backend/.venv` / `frontend/node_modules` symlinks before verification.
3. Implement minimally and preserve contracts unless issue scope says otherwise.
4. Run relevant verification by tier (for backend code changes, include targeted behavior checks plus `make backend-static-verify` before push/PR update).
5. Open PR with `Closes #<task-id>`.
6. Return the short reviewer kickoff from section 3a.
7. After review verdict:
   - `ACTIONABLE`: use Delta-Only Patch Handoff below.
   - `APPROVED`: finalize Task and return completion summary.
```

### Backend integration pytest in agent/sandbox environments

Before running Tier 1 `cd backend && .venv/bin/pytest ...` or Tier 3 `make backend-verify` from an **agent**: integration tests need **PostgreSQL** at `TEST_DATABASE_URL` (see `backend/conftest.py`). **Sandboxed** agent shells often cannot reach `localhost:5432` → **all tests error (`E`) during setup**, not real assertion failures. **Run outside sandbox** (network to localhost) or have the **human** run the command and paste output — do not burn retries in a blocked environment. Canonical detail: `docs/workflow/VERIFY.md` and `backend/AGENTS.md`.

For backend code changes, run `make backend-static-verify` before push/PR update in addition to any targeted behavior checks; docs-only or non-backend-only changes do not need backend static verification.

Behavior Matrix (required for stateful/cross-layer tasks):
- states/statuses and allowed actions
- externally visible success/error semantics
- side effects per path
- failure-path outcomes

Open Product Decisions (when applicable):
- list unresolved UX/content decisions that should not be silently locked by implementation/tests
- if unresolved, mark as follow-up candidate

## Delta-Only Patch Handoff (Post-Review)

```text
Patch Task #<task-id> / PR #<pr-id> on branch <task-branch> after review.

Reference <execution-brief-filepath>  # when present
Reference <analog-filepath>  # when relevant

Inputs:
- Review verdict: ACTIONABLE
- Findings to address: <paste only findings being patched>

Deliver:
1. Patch listed findings only.
2. Keep Task issue authoritative.
3. Rerun targeted verification unless scope expanded; for backend code patches also run `make backend-static-verify` before push/PR update.
4. Return concise patch summary + targeted verification + follow-up (if any).
```

## 1.5) Optional: Domain Pass and Post-Domain Grill-Me

Use these before issue creation when the feature introduces or changes business terms, lifecycle state meaning, or crosses layer/service boundaries. See `docs/ISSUES_WORKFLOW.md` "When Domain Pass Is Required" for full qualifying criteria.

**Domain Pass prompt:**

```text
Run a domain pass on <feature/plan>. Challenge terminology against the repo's current language, cross-check against code, update CONTEXT.md inline when terms are resolved, and only suggest an ADR if the decision is hard to reverse, surprising without context, and the result of a real trade-off.
```

**Post-domain grill-me prompt** (use after Domain Pass when execution risk or edge cases remain):

```text
Now grill this updated plan for execution risk, hidden edge cases, sequencing problems, and verification gaps. Ask one question at a time and recommend an answer for each.
```

## 2) Planning-Only Kickoff (No Code Changes)

```text
Run kickoff for feature <feature-id> from <filename> mode=<single|gated|fast>, planning-only (no code changes, no PR).

Deliver:
1. Problem framing
2. 3-5 step implementation plan
3. Risks and edge cases
4. Testable acceptance criteria draft
5. Verification plan (exact commands)
6. Why this approach checkpoint
7. Issue-ready markdown artifact(s)
8. Execution Brief decision (create only when it materially compresses execution handoff)
```

## 3) Reviewer Follow-Up After Task PR

### 3a) Short reviewer kickoff (default)

```text
Review Task #<task-id> / PR #<pr-id> | branch `<task-branch>` vs `<base-branch>`.

Implementation verification (already run, green): <e.g. make backend-verify>

Follow `docs/template/KICKOFF.md` section **3b) Full reviewer brief** for review scope, constraints, and required output shape. Reply with `APPROVED` or `ACTIONABLE` per that section. If `APPROVED`, end the same response with the lightweight tutoring handoff per section 4.
```

### 3b) Full reviewer brief (authoritative source)

Use `.github/prompts/review-task.prompt.md`.

Required output shape remains authoritative:
1. Verdict: `APPROVED` or `ACTIONABLE`
2. Findings (if `ACTIONABLE`): `[severity] path:line | category | issue | impact | required fix`
3. Verification notes
4. Residual risk/testing gaps
5. If `APPROVED`, include section 4 lightweight tutoring handoff in the same response

## 4) Required Lightweight Tutoring Handoff (Reviewer-Owned)

The approving reviewer generates this once in the same `APPROVED` response.

```text
Learning handoff:
- Concept primer: <plain-language explanation of the underlying idea before this PR's specifics>
- What changed: <2-3 sentences max>
- Why it was done this way: <brief rationale>
- Tradeoff or pattern worth learning: <one point>
- How to review this kind of change: <what a junior operator should inspect first next time>
```

Keep the concept primer to 2-4 sentences. Natural file mentions are allowed when they help the explanation, but dedicated code-pointer blocks are not required.
