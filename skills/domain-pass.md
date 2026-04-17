# Playbook: Domain Pass
This is a portable procedural playbook. It is not runtime-loaded unless your tooling explicitly loads it.

Use this when a feature changes product language, lifecycle semantics, or cross-layer domain concepts.

1. Read `CONTEXT.md` first when present.
2. Read the current planning control docs before proposing changes:
   - `AGENTS.md`
   - `docs/ISSUES_WORKFLOW.md`
   - `docs/workflow/IMPLEMENT.md`
   - `docs/template/KICKOFF.md`
3. Challenge overloaded or conflicting terms immediately.
4. Prefer Stima product language over implementation jargon.
5. Stress-test language with concrete scenarios and edge cases.
6. If code or docs can answer a terminology claim, check them.
7. Update `CONTEXT.md` inline as terms are resolved; do not batch glossary edits.
8. Record Decision Locks in the controlling issue when the work needs a scoped decision.
9. Suggest an ADR only when all three are true:
   - hard to reverse
   - surprising without context
   - real trade-off between plausible options
10. After language is stable, hand off to normal issue/spec drafting or an optional `skills/grill-plan.md` pass.

Output should be concise and include:
- resolved canonical terms
- avoided synonyms when important
- open ambiguities that still need a decision
- whether an ADR is warranted or not

Repo docs win over this playbook if wording conflicts.
