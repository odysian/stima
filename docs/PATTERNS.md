# Patterns - Stima

Record conventions that already exist in code.

## Project Patterns Status
- TODO: Add Stima-specific conventions once features are implemented.

## Boundary Contract (Mandatory)
- Allowed: `api -> services -> repositories -> integrations/libs`
- Disallowed: reverse imports and cross-layer shortcuts.
- Public service functions must add value (orchestration/validation/policy/transactions), not pass-through wrappers.
- Repositories contain persistence/query logic only, no transport concerns.

## File-Size Budgets
- Frontend leaf components: target `<=250` LOC.
- Frontend hooks/services: target `<=180` LOC.
- Backend route/service/repository modules: target `<=220` LOC.
- Split or create linked follow-up when modules exceed split thresholds.

## Verification Reference
```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest && cd ../frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
