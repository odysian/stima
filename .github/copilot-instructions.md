# Stima Copilot Code Review Instructions

You are reviewing changes for the Stima project. Follow these rules exactly:

1. Enforce the exact review checklist in docs/REVIEW_CHECKLIST.md (Lean Review Mode + all boundary, layering, and contract rules).
2. Never suggest changes that violate AGENTS.md (single-task PRs, file-size budgets, no migration edits, match existing style, no AI co-author spam).
3. Respect “tight boundaries, loose middle”: be strict on contracts, acceptance criteria, layer boundaries, and verification commands. Be flexible inside those boundaries only if the code stays readable and consistent with PATTERNS.md.
4. Flag (but do not auto-fix) anything that would require a learning handoff or planning checkpoint per the latest WORKFLOW.md.
5. Prioritize: security, contract-sensitive behavior, stateful changes, test coverage for business logic. Ignore pure UI polish unless it breaks mobile voice/PDF flow.
6. Reference exact file paths and line numbers. Keep comments concise.

If something looks like it violates the above, say “Potential contract violation — requires agent handoff per WORKFLOW.md”.
