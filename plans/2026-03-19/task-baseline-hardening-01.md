## Goal
Harden the initial Stima baseline by closing early setup gaps identified in review: enforce strong auth secret guardrails, make Alembic model discovery resilient, align verification contracts across Makefile/CI (including backend boundary guardrails), and clean dead docs references.

## Scope
**In:**
- Add `SECRET_KEY` validation in backend settings (`>=32` chars and placeholder-value rejection)
- Add feature model registry module for Alembic autoload and wire Alembic to it
- Add backend boundary guardrail script and include it in canonical backend verification
- Align CI workflows to use canonical Makefile verification targets and guardrails
- Clean dead references in docs index/template paths
- Add/update tests where behavior changed

**Out:**
- Frontend feature implementation and frontend behavior tests beyond baseline verification
- Auth protocol redesign or token-format changes
- Infrastructure/deploy workflow redesign

## Implementation notes
- Follow strict secret-key guardrail approach from `~/vector-doc-qa/backend/app/config.py` adapted to Stima config model.
- Keep backend layer boundary guardrail lightweight and AST-based.
- Preserve existing backend architecture (`api -> services -> repositories -> integrations/libs`) and SQLAlchemy 2.0 conventions.

## Decision locks (backend-coupled only)
- [x] Locked: Fail fast on unsafe `SECRET_KEY` values to prevent weak JWT signing configuration
- [x] Locked: Centralize model imports in a registry module to avoid silent Alembic autogenerate drift

## Acceptance criteria
- [ ] `Settings` rejects `SECRET_KEY` values shorter than 32 chars
- [ ] `Settings` rejects known placeholder/dev `SECRET_KEY` values
- [ ] Alembic env imports a central feature-model registry module instead of direct feature imports
- [ ] Backend boundary guardrail script exists and fails on disallowed cross-layer imports
- [ ] `make backend-verify` includes boundary guardrail + lint/type/security/tests
- [ ] GitHub backend/frontend workflows execute canonical make targets used locally
- [ ] Dead docs template references are removed or corrected
- [ ] Tests covering new config validation and registry/guardrail behavior pass

## Verification
```bash
make backend-verify
make frontend-verify
```

## PR checklist
- [ ] PR references this issue (`Closes #...`)
- [ ] Docs updated if needed (architecture/patterns/review checklist/ADR)
- [ ] Tests added/updated where needed
