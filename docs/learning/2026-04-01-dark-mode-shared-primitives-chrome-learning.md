- What changed: We finished the shared dark-mode contract so dark tokens can come from either the OS-fallback media query or an explicit `html[data-theme="dark"]` override. We also converted shared chrome and modal surfaces to token-backed glass, shadow, and backdrop classes instead of light-only fills and raw inline shadows.
- Why it was done this way: This task sits underneath the route-level dark-mode tasks, so the safest move was to fix the shared CSS and shared components once, then let later screens inherit the same contract. That keeps dark-mode behavior consistent across boot, runtime theme changes, and shared UI primitives.
- Tradeoff or pattern worth learning: Supporting both `system` and explicit theme overrides means some dark token declarations are duplicated on purpose. The key pattern is that `system` clears `data-theme` so CSS can follow `prefers-color-scheme`, while explicit `light` and `dark` still win when the user chooses them.
- What to review first: Start with the CSS contract, then read the theme helper that applies the HTML attribute behavior, then check one shared chrome component and one modal component to see how the token-backed classes replace raw light-theme styles.

Code pointers:
- frontend/src/index.css > 69
- frontend/src/index.css > 84
- frontend/src/index.css > 153
- frontend/src/shared/lib/theme.ts > 96
- frontend/src/shared/lib/theme.test.tsx > 99
- frontend/src/shared/components/ScreenHeader.tsx > 21
- frontend/src/shared/components/ConfirmModal.tsx > 57
- docs/DARK_MODE_ADDENDUM.md > 618
