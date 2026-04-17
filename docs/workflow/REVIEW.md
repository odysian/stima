# Workflow: Review

Review-loop guidance, patch follow-up norms, and completion handoff expectations.

## Agent Output Budget

Default chat output should stay concise and non-duplicative:

1. Findings-first: lead with what changed, key risks, and verification outcome.
2. Bounded recap: when Task issue scope is already explicit, avoid long restatements.
3. No duplicate verification blocks: report commands run and result; include only minimal failure context when needed.
4. Completion summaries: changed files + one-line intent per file; avoid re-deriving stable repo rules.
5. Review replies: `ACTIONABLE` should be finding-focused with minimal preamble; `APPROVED` follows the tutoring handoff contract.

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

After opening a Task PR, default to the short reviewer kickoff in `docs/template/KICKOFF.md` section 3a. Section 3b there defines the authoritative output contract and points to `.github/prompts/review-task.prompt.md` for the full brief.
Do not redefine the format in this file; keep `docs/template/KICKOFF.md` as the single source of truth.

## Delta-Only Patch Norm

When a review verdict is `ACTIONABLE`, use the delta-only patch handoff in `docs/template/KICKOFF.md` and patch listed findings only unless scope expands.

## Learning Handoff (Required Completion Gate)

The lightweight tutoring handoff is generated once, by the approving reviewer, in the same `APPROVED` response for the completed unit (`Task` completion and `Spec` closure).

- Do not generate a second learning handoff after approval is relayed back; the implementation agent finalizes after approval.
- Do not create a separate markdown handoff unless explicitly requested.
- Keep it ephemeral and practical, not archival documentation.
- Use the five-part format from `docs/template/KICKOFF.md` section 4 (single source of truth):
  - Concept primer (2-4 sentences, plain-language explanation of the underlying idea)
  - What changed
  - Why it was done this way
  - Tradeoff or pattern worth learning
  - How to review this kind of change
- Natural file mentions are allowed when they help the explanation; dedicated code-pointer blocks are not required.
