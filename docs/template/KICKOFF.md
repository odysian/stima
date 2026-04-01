# Kickoff Prompts

Use these prompts to start an agent on already-scoped work with predictable output.

## 1) Execute Existing Task Issue

```text
Run kickoff for existing Task # mode=single.

Reference <filepath>

Then execute the full Task flow end-to-end:
1. Restate goal, non-goals, acceptance criteria, and exact verification commands from the issue.
2. Create/switch to branch `task-<id>-<slug>`.
3. Implement minimally and surgically, preserving existing contracts unless issue scope says otherwise.
4. Run relevant verification once after implementation.
5. Open PR with `Closes #<task-id>`.
6. Return the standardized reviewer follow-up prompt from section 3 below.
7. After review verdict is relayed back:
   - if verdict is `ACTIONABLE`: patch required fixes and rerun targeted verification only.
   - if verdict is `APPROVED`: write `docs/learning/YYYY-MM-DD-feature-slug-learning.md` using section 4 below, then return the file path and final completion summary.
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
- Keep mode `single` unless explicitly requested otherwise.
- Be strict about scope, contracts, acceptance criteria, verification, and layer boundaries. Be flexible about internal decomposition and helper structure as long as the implementation stays readable, testable, and consistent with repo patterns.
- For bug fixes, backend business logic, contract-sensitive behavior, and stateful/cross-layer changes, identify the first test/assertion to add before implementation when practical.
- No environment triage loops, no worktree setup, no broad verification reruns.
- For live/provider-backed checks (for example `make extraction-live`), ask the human operator to run them manually and share output instead of running them in agent sessions.
- Keep output concise and findings-first.
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

Constraints:
- Keep it lean and concrete.
- Default to one Task unless explicitly asked for split/gated mode.
- No speculative architecture.
- For bug fixes, backend business logic, contract-sensitive behavior, and stateful/cross-layer changes, identify the first test/assertion to add when practical.
- UI polish, exploratory work, copy tweaks, and other low-risk changes can stay lighter.
```

Notes:
- If `mode=gated`, output Spec + default child Task issue bodies and commands.
- If `mode=fast`, output a quick-fix checklist and verification plan; no issue creation by default.

## 3) Standard Reviewer Follow-Up Prompt (Robust)

Use this exact prompt after opening a Task PR.

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
```

## 4) Required Lightweight Tutoring Handoff (After APPROVED)

Use this after explicit reviewer verdict `APPROVED` is provided back to the implementation agent.

Filename and location:
- `docs/learning/YYYY-MM-DD-feature-slug-learning.md`

Keep it lightweight enough to generate and consume in about five minutes.
Use plain English, tutoring tone, and cap it at four bullets plus code pointers.

```text
- What changed: <2-3 sentences max>
- Why it was done this way: <brief rationale>
- Tradeoff or pattern worth learning: <one thing to teach>
- What to review first: <how a junior operator should read the diff>

Code pointers:
- Use `filename > line number` entries for web-chat/no-IDE contexts.
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

If APPROVED, also generate the updated lightweight learning handoff.
