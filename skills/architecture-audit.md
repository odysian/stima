# Playbook: Architecture Audit
This is a portable procedural playbook. It is not runtime-loaded unless your tooling explicitly loads it.

Use this for periodic architecture review or before planning a focused refactor.

1. Identify the narrow area under review before recommending changes.
2. Read the current contracts/docs for that area first.
3. Look for:
   - shallow modules with large surfaces
   - business logic split across too many layers
   - boundary leakage between API/services/repositories/integrations
   - dependencies that block easy testing
   - external integrations without a clean port/adapter seam
4. Classify dependencies where useful:
   - in-process
   - local-substitutable
   - remote but owned
   - true external
5. Recommend changes in concrete terms:
   - what to deepen
   - what boundary to redraw
   - where to introduce a port/adapter
   - what tests become easier afterward
6. Prefer incremental refactors over large rewrites.
7. Tie recommendations back to Stima-specific pain points when relevant, such as extraction flow, provider seams, background jobs, or document-generation boundaries.

Output should be a short audit with prioritized findings, expected payoff, and the smallest worthwhile next refactor.

Repo docs win over this playbook if wording conflicts.
