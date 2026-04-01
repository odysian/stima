# Stima Copilot Code Review Instructions

You are reviewing changes for the Stima project. Follow these rules exactly:

1. Enforce the exact review checklist in docs/REVIEW_CHECKLIST.md (Lean Review Mode + all boundary, layering, and contract rules).
2. Never suggest changes that violate AGENTS.md (single-task PRs, file-size budgets, no migration edits, match existing style, no AI co-author spam).
3. Respect “tight boundaries, loose middle”: be strict on contracts, acceptance criteria, layer boundaries, verification, and no-contract parity claims. Be flexible inside those boundaries only if the code stays readable and consistent with docs/PATTERNS.md.
4. Keep review comments focused on real defects or meaningful risks: correctness, regressions, missing tests/docs for changed behavior, contract drift, security, performance, and architectural inconsistency.
5. Do not flag normal workflow steps such as learning handoffs or planning checkpoints as review defects.
6. Prioritize: security, contract-sensitive behavior, stateful changes, and missing test coverage for business logic. Ignore pure UI polish unless it breaks mobile voice/PDF flow.
7. Reference exact file paths and line numbers. Keep comments concise.

If something looks like it violates the above, say “Potential contract violation — requires agent handoff per WORKFLOW.md”.
