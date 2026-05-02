# SPEC-001B — Design Token -> Restyle Theme

**Parent umbrella:** `plans/react-native/SPEC-001-rn-expo-rewrite.md`
**Phase:** 1 Foundation
**Effort:** 3–4 days

## Goal

Port the M3-inspired token system from CSS custom properties to a JavaScript/TypeScript theme object usable by Restyle or StyleSheet.

## References

- `frontend/src/index.css` — Complete token catalog (colors, radii, shadows, fonts, safe-area vars).
- `frontend/UI_SYSTEM.md` — Primitive catalog, banned patterns, composition rules.
- `frontend/src/shared/components/Button.tsx` — Button variants (primary, secondary, ghost, danger) and sizes.
- `frontend/src/shared/components/Input.tsx` — Input states and styling.
- `frontend/src/ui/Sheet.tsx` — Modal/sheet surface styling (radius, shadow, backdrop).
- `frontend/src/ui/Toast.tsx` — Toast positioning and styling.

## Acceptance Criteria

- [ ] Theme object with typed colors (light/dark), spacing, border radii, breakpoints.
- [ ] `Box`, `Text`, `Card` Restyle primitives (or equivalent StyleSheet helpers) covering all current surface types.
- [ ] Button component with variants `primary`, `secondary`, `ghost`, `danger` and sizes `sm`, `md`, `lg`.
- [ ] Input component with states: default, focused, error, disabled.
- [ ] Sheet/Modal component with backdrop, safe-area insets, and dismiss gesture.
- [ ] Toast component with auto-dismiss, manual dismiss, and queue management.
- [ ] Typography system: `headline` (Space Grotesk), `body`/`label` (Inter).

## Scope Notes

- Styling choice locks in Phase 0: Restyle vs. StyleSheet helper system. Child tasks under this spec must not mix both patterns.
- Preserve the current design language; do not introduce a new visual system under cover of the platform port.
