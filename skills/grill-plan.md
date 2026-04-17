# Playbook: Grill a Plan
This is a portable procedural playbook. It is not runtime-loaded unless your tooling explicitly loads it.

Use this after terminology is reasonably stable and you want to pressure-test execution.

1. Read the relevant plan/spec/Task first.
2. Read `CONTEXT.md` when present so you do not re-open already resolved language without cause.
3. Read the execution control docs when needed:
   - `docs/ISSUES_WORKFLOW.md`
   - `docs/workflow/IMPLEMENT.md`
   - `docs/workflow/VERIFY.md`
4. Ask one question at a time.
5. For each question, provide the recommended answer.
6. Prefer questions about:
   - failure modes
   - edge cases
   - sequencing/dependencies
   - rollback or migration risks
   - acceptance gaps
   - verification blind spots
   - contradictions between the plan and current code/docs
7. If the repo or code can answer the question, inspect that instead of asking blindly.
8. Do not turn this into a glossary session unless the plan clearly conflicts with `CONTEXT.md`.
9. When the plan is strong enough, summarize the remaining risks and the most important first verification target.

Keep the session practical. The goal is to make the Task or Spec safer to execute, not to maximize questioning for its own sake.

Repo docs win over this playbook if wording conflicts.
