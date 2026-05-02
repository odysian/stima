# SPEC-001A — Expo Scaffold & Navigation

**Parent umbrella:** `plans/react-native/SPEC-001-rn-expo-rewrite.md`
**Phase:** 1 Foundation
**Effort:** 3–5 days

## Goal

Bootstrap the React Native project with Expo, set up file-based routing with Expo Router, and establish the navigation structure (tabs, stacks, modals).

## References

- `frontend/src/App.tsx` — Route definitions and route guards (`ProtectedRoute`, `PublicRoute`, `OnboardingRoute`, `RootHome`).
- `frontend/src/main.tsx` — Root providers (`AuthProvider`, `ThemeProvider`, `ToastProvider`, `BrowserRouter`).
- `frontend/src/shared/components/BottomNav.tsx` — Tab structure (Quotes, Customers, Settings).

## Acceptance Criteria

- [ ] Current stable Expo SDK project with TypeScript, file-based routing (`app/` directory); exact SDK version locked during Phase 0 after validating native module compatibility.
- [ ] Root layout with `SafeAreaProvider`, `GestureHandlerRootView`.
- [ ] Tab layout for authenticated users: Quotes (`/`), Customers (`/customers`), Settings (`/settings`).
- [ ] Stack modals for: Capture, Review/Edit, Quote Preview, Customer Detail, Customer Create.
- [ ] Auth-guarded route groups: `(public)` for login/register, `(app)` for authenticated features.
- [ ] Dark-first theme support via persisted app setting plus system appearance; no restart required.
- [ ] Loading screen matching current `LoadingScreen.tsx` aesthetic.

## Scope Notes

- Navigation choice locks in Phase 0: Expo Router is the recommended default unless the spike finds a blocker.
- This spec owns app shell and route structure only. It should not silently decide auth, storage, or styling patterns beyond what Phase 0 already locked.
