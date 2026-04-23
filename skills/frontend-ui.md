# Frontend UI Playbook

Thin playbook for planning sessions that touch Stima frontend visuals.

**Source of truth:** [`frontend/UI_SYSTEM.md`](../frontend/UI_SYSTEM.md)

## Quick start

1. Open `frontend/UI_SYSTEM.md`.
2. Check the **Decision Tree** to pick the right primitive.
3. Check the **Banned Patterns** list before writing new markup.
4. Verify your raw `<button>` has a whitelist entry or migrate it to `<Button>`.

## Planning checklist

- [ ] Does the design introduce any new document-style surface? → Use `rounded-[var(--radius-document)]`.
- [ ] Does the design introduce a new color? → Map to an existing token or justify a new one in `frontend/src/index.css`.
- [ ] Does the design need a text input? → Use `<Input>`, `<NumericField>`, `<PasswordField>`, or `<Select>`.
- [ ] Does the design need a button? → Use `<Button>` unless it falls into a whitelist category.
- [ ] Does the design need a modal/sheet? → Use `<Sheet>`; never import Radix `Dialog.Root` directly.
- [ ] Does the design need a section label? → Use `<Eyebrow>`.
- [ ] Are tap targets ≥ 44px?
- [ ] Is `active:scale-*` used? Is hover-scale avoided?
- [ ] Are safe-area insets considered for fixed/sticky elements?
- [ ] Will it work in `[data-theme="light"]`?

## Primitive updates

Any new primitive requires a same-PR update to `frontend/UI_SYSTEM.md` catalog. No undocumented primitives.

Any primitive deletion moves the catalog entry to a `## Deprecated` section with the replacement. No silent removals.
