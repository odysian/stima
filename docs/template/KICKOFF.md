# Kickoff Prompts

Use these prompts to start an agent on already-scoped work with predictable output.

## 1) Execute Existing Task Issue

```text
Run kickoff for existing Task #<task-id> mode=single.

Reference <execution-brief-filepath>  # when present
Reference <analog-filepath>  # when relevant

Then execute the full Task flow end-to-end:
1. Restate goal, non-goals, acceptance criteria, and exact verification commands from the Task issue. If an Execution Brief exists, use it as the working handoff for task-local deltas only; the Task issue remains the source of truth.
2. Branch / checkout setup:
   - default execution: create/switch to branch `task-<id>-<slug>`
   - if `execution=parallel`: run `scripts/worktree-init.sh <task-id> [slug]`, work only inside the returned `WORKTREE_READY` path, and use the created branch there; before running verification confirm that `backend/.venv` and/or `frontend/node_modules` symlinks exist inside the worktree — if missing, stop and ask the operator to create them from the main checkout
3. Implement minimally and surgically, preserving existing contracts unless issue scope says otherwise.
4. Run relevant verification once after implementation.
5. Open PR with `Closes #<task-id>`.
6. Return the **short reviewer kickoff** from section 3a below only. Do **not** paste the full section 3b brief unless the operator explicitly asks for the inline copy.
7. After review verdict:
   - if verdict is `ACTIONABLE`: use the delta-only patch handoff below; patch listed findings only and rerun targeted verification unless scope expands.
   - if verdict is `APPROVED`: finalize the Task and return the final completion summary; do not generate a second lightweight tutoring handoff after approval is relayed back.
8. If the Task touches state transitions, frontend action availability, external provider side effects, or contract/error semantics, include a short Behavior Matrix before implementation.

Behavior Matrix (required for stateful/cross-layer tasks):
- States/statuses involved and allowed actions per state
- Endpoint success/error codes and exact externally visible error semantics
- Side effects per path (DB writes, event logs, provider calls, token/state changes)
- Failure-path outcomes (what still changes if downstream provider or persistence fails)

Open Product Decisions (required when applicable):
- List any unresolved UX/content decisions that should not be silently locked in by implementation or tests
- If unresolved, explicitly mark them as follow-up candidates rather than encoding them as "correct" behavior

Constraints:
- Apply stable repo defaults from `AGENTS.md`, `docs/ISSUES_WORKFLOW.md`, and `docs/WORKFLOW.md` by reference unless this Task introduces a task-specific exception.
- Keep mode `single` unless explicitly requested otherwise.
- For bug fixes, backend business logic, contract-sensitive behavior, and stateful/cross-layer changes, identify the first test/assertion to add before implementation when practical.
- No environment triage loops, no worktree setup, no broad verification reruns.
- For live/provider-backed checks (for example `make extraction-live`), ask the human operator to run them manually and share output instead of running them in agent sessions.
- Keep output concise and findings-first.
```

### Recommended Operator Flow

- `Task issue`: authoritative scope, acceptance criteria, and verification.
- `Execution Brief`: optional compressed working handoff for task-local deltas, file scope, blockers, and locked decisions; it never replaces the Task issue.
- `Analog docs`: optional references such as `docs/analogs/*`; point to them when a repeated pattern applies instead of reprinting repo guidance.
- `Kickoff`: reference the Task plus the brief and analogs that matter for this execution pass.
- `Post-review patching`: if review returns `ACTIONABLE` and scope is unchanged, use the delta-only handoff below instead of rehydrating the full Task.

### Delta-Only Patch Handoff (Post-Review)

```text
Patch Task #<task-id> / PR #<pr-id> on branch <task-branch> after review.

Reference <execution-brief-filepath>  # when present
Reference <analog-filepath>  # when relevant

Inputs:
- Review verdict: ACTIONABLE
- Findings to address: <paste only the findings being patched>

Deliver:
1. Patch the listed findings only. If a finding requires scope expansion or exposes a product/contract ambiguity, stop and flag that before editing.
2. Keep the Task issue authoritative; use the Execution Brief only for task-local deltas that still apply.
3. Rerun targeted verification for the patched behavior only unless scope expansion invalidates the previous green results.
4. Return a concise patch summary, the targeted verification run, and any follow-up needed.

Constraints:
- Do not restate the full Task scope, stable repo rules, or reviewer contract unless the findings change them.
- No broad verification reruns or environment triage loops by default.
- Preserve existing contracts unless a listed finding explicitly requires a contract correction.
```



## Feature Discovery

What are the highest-value features or improvements I could add next?

Explore the codebase to understand the current state, then suggest 3-5 candidates ranked by impact. The project is currently <pre-launch | post-launch>.

For each candidate:
- What it is (one sentence)
- Why it's high value at this stage
- Rough effort signal (small / medium / large)

Output a ranked list. We'll pick one and move into a whiteboard session.

## Whiteboard

Lets whiteboard out feature Task <TaskNumber> from <FileLocation>

I'd like to talk through the specifics and get the plan concrete enough to draw out the task and gh issue.

We're working toward — by the end of our discussion, not immediately:
1. Problem framing (goal, non-goals, constraints).
2. Implementation plan (3-5 steps, smallest viable path first).
3. Risks and edge cases.
4. Acceptance criteria (testable checks, not prose).
5. Verification plan (exact commands).
6. Issue artifact markdown ready for `gh issue create --body-file`.

## Plan Review

Review the plan above before we move to execution.

Check for:
1. Scope creep — anything beyond the stated goal.
2. Missing edge cases or error paths.
3. Acceptance criteria that aren't testable.
4. Verification gaps (missing commands, untestable claims).
5. Unresolved decisions that will block implementation.

Output: READY or NEEDS WORK, with one-line findings if NEEDS WORK.

## 2) Planning-Only Kickoff (No Code Changes)

```text
Run kickoff for feature <feature-id> from <filename> mode=<single|gated|fast>, planning-only (no code changes, no PR).

Deliver:
1. Problem framing (goal, non-goals, constraints).
2. Proposed implementation plan (3-5 steps, smallest viable path first).
3. Risks and edge cases.
4. Acceptance criteria draft.
5. Verification plan (exact commands).
6. `Why this approach` checkpoint:
   - chosen approach
   - one rejected alternative
   - main tradeoff
   - assumptions/contracts that must hold
7. Recommended issue artifact markdown (Task/Spec as applicable) ready for `gh issue create --body-file` when applicable.
8. Execution Brief decision:
   - Decide whether the resulting Task warrants an Execution Brief.
   - Create one when task-local deltas, analog references, locked decisions, blockers, or task complexity would make implementation handoff meaningfully smaller and clearer.
   - If yes, generate a filled Execution Brief using `docs/template/EXECUTION_BRIEF.md`.
   - If no, state briefly why the Task issue is already compact enough without one.

After a Task issue is created, create an Execution Brief only when task-local deltas, analog references, or locked decisions would make implementation handoff meaningfully smaller and clearer.

Constraints:
- Keep it lean and concrete.
- Default to one Task unless explicitly asked for split/gated mode.
- No speculative architecture.
- Reference stable repo rules from canonical docs instead of reprinting them in the issue artifact unless the task introduces an exception.
- For bug fixes, backend business logic, contract-sensitive behavior, and stateful/cross-layer changes, identify the first test/assertion to add when practical.
- UI polish, exploratory work, copy tweaks, and other low-risk changes can stay lighter.
```

Notes:
- If `mode=gated`, output Spec + default child Task issue bodies and commands.
- If `mode=fast`, output a quick-fix checklist and verification plan; no issue creation by default.

## 3) Reviewer follow-up after Task PR

### 3a) Short reviewer kickoff (default)

Use this after opening a Task PR. It keeps the implementation agent output small; the reviewer loads **section 3b** in-repo for the full scope and output shape.

```text
Review Task #<task-id> / PR #<pr-id> | branch `<task-branch>` vs `<base-branch>`.

Implementation verification (already run, green): <e.g. make backend-verify>

Follow `docs/template/KICKOFF.md` section **3b) Full reviewer brief** for review scope, constraints, and required output shape. Reply with `APPROVED` or `ACTIONABLE` per that section. If `APPROVED`, end the same response with the lightweight tutoring handoff per **section 4** there.
```

### 3b) Full reviewer brief (optional inline copy)

Use this exact prompt when the reviewer thread will not have repo access to `docs/template/KICKOFF.md`, or when the operator explicitly requests the full inline brief.

```text
Review Task #<task-id> / PR #<pr-id> on branch <task-branch> vs <base-branch>.

Goal:
- Identify correctness bugs, regressions, contract drift, boundary/pattern violations, and missing tests/docs.

Review Scope (in priority order):
1. Correctness and regressions (runtime behavior, edge cases, state transitions)
2. Contract parity (status codes, response shapes, error semantics, side effects) if scope claims no contract change
3. Architecture consistency (layer boundaries, dependency direction, service/repository responsibilities)
4. Security and performance risks introduced by this diff
5. Missing or weak tests/docs/comment-contract coverage for changed behavior

Constraints:
- Use local diff and repository context first.
- Use the local diff as the review entrypoint. Expand to surrounding code/tests/docs only when the change touches state transitions, contracts, shared utilities, templates, or cross-layer behavior.
- No environment triage loops or worktree setup.
- Run targeted checks only when needed to validate a specific finding.
- Do not rerun broad verification already reported green unless prior results are suspect.
- Keep output concise and findings-first.
- No command transcript unless a command failed and that failure matters to a finding.
- For stateful/cross-layer Tasks, verify status/action/error/side-effect parity across all affected states, not just the changed happy path.
- If the verdict is `APPROVED`, end the same response with the lightweight tutoring handoff from section 4.
- Classify findings as one of:
  - merge-blocking bug/contract issue
  - quick hardening fix
  - follow-up product/UX decision
- Avoid escalating unresolved wording/copy/product decisions as correctness bugs unless they violate a documented contract.
- Be strict about contract drift, verification gaps, acceptance-criteria misses, and layer-boundary violations. Be flexible about internal helper decomposition when readability, testability, and repo-pattern consistency are intact.
- Do not return `APPROVED` while required PR checks are failing, stale, or missing unless you explicitly inspected that CI state and determined it is non-blocking.


Required Output:
1. Verdict: APPROVED or ACTIONABLE
2. Findings (if ACTIONABLE), one per line with:
   [severity] file/path:line | category | issue | impact | required fix
   - severity: critical/high/medium/low
   - category: correctness|regression|contract|architecture|security|performance|tests|docs
3. Verification notes:
   - targeted checks run (if any) and why
   - whether PR CI/check status was inspected, and any blocking failures
4. Residual risk/testing gaps:
   - up to 5 concise bullets
5. If verdict is `APPROVED`, end with the lightweight tutoring handoff from section 4 in the same chat response
```

## 4) Required Lightweight Tutoring Handoff In Chat (Reviewer-Owned)

The lightweight tutoring handoff is generated once, by the approving reviewer, in the same `APPROVED` response.
Do not generate a second learning handoff after approval is relayed back.

Post it directly in the same chat/thread.
Do not create a separate markdown handoff unless explicitly requested.
Keep it lightweight enough to generate and consume in about five minutes.
Use plain English, tutoring tone, and cap it at 4 short bullets plus 3-6 code pointers.

```text
- What changed: <2-3 sentences max>
- Why it was done this way: <brief rationale>
- Tradeoff or pattern worth learning: <one thing to teach>
- What to review first: <how a junior operator should read the diff>

Code pointers:
- `path:line-line — why it matters`
```


## 5) Copilot/Codex Code Review PR Review Triage Prompt (Light)

Copy-paste this exact prompt when GitHub Copilot or Codex leaves comments on a Task PR:

```text
Review all GitHub Copilot comments on Task #<task-id> / PR #<pr-number>.

You are the final decision maker. Evaluate every comment strictly against the Stima contract:

- docs/REVIEW_CHECKLIST.md
- AGENTS.md (single-task scope, file-size budgets, no migration edits, match style)
- docs/WORKFLOW.md (Lean Review Mode + tight boundaries, loose middle)

For each comment decide:
- ACCEPT → valid and in-scope; make the smallest surgical fix if needed
- REJECT → violates contract; state the exact rule
- DEFER → useful but out-of-scope; create a one-line follow-up issue

Constraints:
- Stay inside the approved task scope and single mode.
- Never make large refactors or pattern changes just because Copilot suggested them.
- Respect “tight boundaries, loose middle”.

Output (keep it short):
1. Bullet list of decisions with one-line reasons.
2. Any code changes made (file + one-line summary).
3. Final verdict: APPROVED / ACTIONABLE / NO_CHANGES_NEEDED

This review step is for findings triage only. Do not generate a learning handoff here. Reserve the lightweight tutoring handoff for the final approving reviewer response when the change is explicitly approved.
```

## 6) Grill-me planning
```
Interview me relentlessly about every aspect of this plan until
we reach a shared understanding. Walk down each branch of the design
tree resolving dependencies between decisions one by one.

If a question can be answered by exploring the codebase, explore
the codebase instead.

For each question, provide your recommended answer.
```
