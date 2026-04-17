# Playbook: TDD at the Boundaries
This is a portable procedural playbook. It is not runtime-loaded unless your tooling explicitly loads it.

Use this when selective test-first work would clarify a risky behavior boundary.

1. Identify the public behavior or contract that matters most.
2. Write the first test at that boundary, not inside helpers or private implementation details.
3. Prefer integration-style tests that exercise real code paths through the public interface.
4. Keep mocks/fakes at true external boundaries only.
5. Use red -> green -> refactor when it improves clarity; do not force TDD where it adds ceremony without insight.
6. Good candidates include:
   - auth/security-sensitive flows
   - extraction or formatting rules
   - API request/response contracts
   - queue/job behavior
   - PDF/document generation invariants
   - regression-prone bug fixes
7. Bad candidates include brittle tests that assert internal call structure, private helpers, or mock-heavy implementation details.
8. When done, record the exact verification commands needed using `docs/workflow/VERIFY.md`.

This playbook supports the repo's selective TDD stance: strict at the edges, flexible in the middle.

Repo docs win over this playbook if wording conflicts.
