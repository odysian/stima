## Tasks + Review

Run kickoff for existing Task #<task-id> mode=single.

Reference <execution-brief-filepath>  # when present
Reference <analog-filepath>  # when relevant

---

Review Task #<task-id> / PR #<pr-id> on branch <task-branch> vs <base-branch>.

---

Patch Task #<task-id> / PR #<pr-id> on branch <task-branch> after review.

Reference <execution-brief-filepath>  # when present
Reference <analog-filepath>  # when relevant

Inputs:
- Review verdict: ACTIONABLE
- Findings to address: <paste only the findings being patched>

---
**Rereview**

Re-review Task #<task-id> / PR #<pr-id> after patching.

Reference:
- prior review findings
- patched summary
- targeted verification run

Focus:
- confirm whether the listed findings were resolved
- identify any regressions introduced by the patch
- return APPROVED or ACTIONABLE

---
**Copilot**

Review all GitHub Copilot comments on Task #<task-id> / PR #<pr-id>.

For each comment decide:
- ACCEPT
- REJECT
- DEFER

Stay inside approved task scope and single mode.
Use the Stima review contract and repo docs as the standard.
Return:
1. decisions with one-line reasons
2. any code changes made
3. final verdict: APPROVED / ACTIONABLE / NO_CHANGES_NEEDED

---

## Planning

Lets whiteboard feature <feature-id> from <plan-filepath>.

Goal:
- Make the task concrete enough for issue creation and later implementation.

Work toward:
1. Problem framing
2. Smallest viable implementation plan
3. Risks and edge cases
4. Testable acceptance criteria
5. Exact verification commands
6. Issue-ready markdown

---

Review the plan in <plan-filepath> before execution.

Check for:
1. Scope creep
2. Missing edge cases or error paths
3. Acceptance criteria that are not testable
4. Verification gaps
5. Unresolved decisions that will block implementation

Output: READY or NEEDS WORK, with one-line findings if NEEDS WORK.

---

Run kickoff for feature <feature-id> from <plan-filepath> mode=<single|gated|fast>, planning-only (no code changes, no PR).

---

Create an Execution Brief for Task #<task-id> using docs/template/EXECUTION_BRIEF.md.

Reference:
- <task-issue-link>
- <plan-filepath>  # optional
- <analog-docpath>  # when relevant

Constraints:
- The GitHub Task issue remains the source of truth.
- Keep the brief task-local and compressed.
- Capture deltas, file scope, analogs, locked decisions, verification, and blockers only.
- Do not restate stable repo rules or paste the full issue body.

---
