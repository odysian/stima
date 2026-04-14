# Stima Copilot Instructions

Follow repo workflow and review constraints from:
- `AGENTS.md`
- `docs/ISSUES_WORKFLOW.md`
- `docs/REVIEW_CHECKLIST.md`

Prioritize meaningful defects and risks:
- correctness
- regressions
- contract drift
- security
- performance
- missing tests/docs for changed behavior

Be strict on boundaries, acceptance criteria, and externally visible behavior.
Be flexible inside those boundaries when code remains readable and consistent with repo patterns.

Do not flag normal workflow artifacts (planning checkpoints, reviewer tutoring handoffs) as defects.
Reference exact file paths and line numbers.
