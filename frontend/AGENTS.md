# Frontend AGENTS — Stima

Apply this file when primary scope is `frontend/` or issue labels include `area:frontend`.

## Frontend Defaults

- Preserve feature-first structure: `src/features/<feature>` with shared code in `src/shared`.
- Keep route/page shells thin; move behavior into feature hooks/services/components.
- Keep feature boundaries explicit and avoid cross-feature internals.

## UI/Behavior Safety

- For stateful UI changes, verify action availability across relevant states.
- Preserve existing API/error contracts unless task scope explicitly changes them.
- If behavior decisions are unresolved, capture them as follow-up candidates instead of silently locking them in tests.

## Verification Tiers (Frontend)

- Tier 1 (implementation loop): smallest frontend checks proving changed behavior.
  - Example: `cd frontend && npx vitest run src/features/<feature>/tests/<file>.test.tsx`
  - Example: `cd frontend && npx eslint src/features/<feature>`
- Tier 2 (post-review patch): rerun only checks covering patched findings unless scope expands.
- Tier 3 (PR/final gate): `make frontend-verify` (or `make verify` when cross-surface).
- Tier 4 (operator-only heavy): manual/live checks only when explicitly required.

## Practical File-Size Budgets

- frontend components target `<=250` LOC
- frontend hooks/services target `<=180` LOC
- split or create follow-up when component exceeds `450` LOC or hook/service exceeds `300` LOC
