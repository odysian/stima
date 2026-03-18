# Greenfield Blueprint — Stima

This file is the default baseline for new repositories that use this template.

## Goals

- Keep codebase traversal fast and predictable.
- Keep boundaries explicit so refactors stay safe.
- Make verification reproducible across local and CI.
- Keep production behavior stable while code is reorganized.

## Repository Blueprint (Default)

```text
Stima/
  AGENTS.md
  WORKFLOW.md
  ISSUES_WORKFLOW.md
  GREENFIELD_BLUEPRINT.md
  docs/
    ARCHITECTURE.md
    PATTERNS.md
    REVIEW_CHECKLIST.md
    adr/
  plans/
  backend/
    app/
      api/                      # Route registration/composition only
      features/
        <feature>/
          api.py                # Feature endpoints (thin)
          service.py            # Orchestration and policy
          repository.py         # DB access primitives
          schemas.py            # Feature-local schemas (optional)
          tests/
      integrations/             # Queue/storage/LLM/external API adapters
      shared/                   # Cross-feature domain utilities
    tests/
  frontend/
    src/
      app/                      # Route shells/composition
      features/
        <feature>/
          components/
          hooks/
          services/
          types/
          tests/
      shared/
        components/
        hooks/
        lib/
        types/
        tests/
    tests/
```

For repos that already use a different structure, preserve existing layout unless a dedicated migration Task scopes restructuring.

## Boundary Contract (Mandatory)

- Allowed: `api -> services -> repositories -> integrations/libs`
- Disallowed: reverse imports and cross-layer shortcuts.
- Public service functions must add value (orchestration/validation/policy/transactions), not argument pass-through.
- Repositories contain persistence/query logic only, no HTTP concerns.

## No-Contract Refactor Parity Lock (Mandatory)

For refactors declared as "no API/contract change", verify:

1. Status code parity (success and error).
2. Response schema parity (field names/types/envelope shape).
3. Error semantics parity (externally visible error behavior).
4. Side-effect parity (DB writes, queueing, storage, notifications).

## File-Size Guardrails

- Frontend leaf components: target `<=250` LOC.
- Frontend single-purpose hooks/services: target `<=180` LOC.
- Backend route modules: target `<=220` LOC.
- Backend services/repositories: target `<=220` LOC.
- `300-400` LOC can be acceptable when cohesive; split or create linked follow-up when:
  - frontend component `>450` LOC
  - frontend hook/service `>300` LOC
  - backend route/service/repository `>350` LOC

## Toolchain Contract (Mandatory)

- Pin runtimes in-repo (for example `.nvmrc`, `.python-version`, `tool-versions`, or equivalent).
- Declare Node runtime in `package.json` via `engines`.
- Keep README prerequisites, local verify commands, and CI runtime versions aligned.
- Verification should fail fast on runtime mismatch.

## Verification Baseline

- Backend verify should include: boundary guardrail check, lint, type check, tests, security scan.
- Frontend verify should include: type check, tests, lint, production build.
- For no-contract refactors, parity lock validation must be reported with verification results.

## Documentation Layout Recommendation

For clean traversal, keep root docs lean and move detailed docs into `docs/`:

- Keep at root: `AGENTS.md`, `WORKFLOW.md`, `ISSUES_WORKFLOW.md`, `GREENFIELD_BLUEPRINT.md`.
- Keep in `docs/`: `ARCHITECTURE.md`, `PATTERNS.md`, `REVIEW_CHECKLIST.md`, ADRs, runbooks.
- Keep automation playbooks under `skills/`.

