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

## UI System (Required Reading)

For any `area:frontend` work touching visuals, open [`frontend/UI_SYSTEM.md`](UI_SYSTEM.md) before editing. It contains the token catalog, primitive catalog, composition rules, decision tree, banned patterns, and acceptance gates.

### Banned patterns (quick reference)

- No `rounded-xl` / `rounded-lg` on document surfaces — use `rounded-[var(--radius-document)]`.
- No inline `<button className="forest-gradient...">` — FABs only, and they are whitelisted.
- No raw `<input>` in feature code — use `<Input>`, `<NumericField>`, `<PasswordField>`, or `<Select>`.
- No Radix `Dialog.Root` outside `Sheet.tsx` — feature code imports `<Sheet>`.
- No inline eyebrow spans — use `<Eyebrow>`.
- No hover-scale — tappables use `active:scale-*`.
- No new inline hex colors — reference tokens from `frontend/src/index.css`.
- No undocumented raw `<button>` — whitelist or migrate.

### Before adding new primitives

Grep `frontend/UI_SYSTEM.md` and `frontend/src/ui/` before introducing:
- a new `<input>` variant
- a new `<button>` style
- a `Dialog.Root` import
- an inline eyebrow span

Reuse existing primitives. If a genuinely new primitive is required, update `UI_SYSTEM.md` catalog in the same PR.

## Practical File-Size Budgets

- frontend components target `<=250` LOC
- frontend hooks/services target `<=180` LOC
- split or create follow-up when component exceeds `450` LOC or hook/service exceeds `300` LOC
