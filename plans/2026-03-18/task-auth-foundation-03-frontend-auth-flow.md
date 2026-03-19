# Task: Auth Foundation 03 - Frontend Auth Flow + Component Tests

## Goal
Implement frontend auth transport/state/forms/route protection, including component-level tests for login and register.

## Parent Spec
Parent Spec: #1

## Scope
**In:**
- Vitest config wired into `vite.config.ts` (jsdom environment, setupFiles, path alias)
- Test setup file (`src/shared/tests/setup.ts`) importing `@testing-library/jest-dom`
- Shared auth transport (`src/shared/lib/http.ts`): fetch wrapper with `credentials: include`, CSRF header, one-refresh retry, single-flight refresh guard
- Auth types (`src/features/auth/types/auth.types.ts`): `User`, `LoginRequest`, `RegisterRequest`, `AuthResponse`
- Auth service (`src/features/auth/services/authService.ts`): `login`, `register`, `logout`, `me`
- Auth context (`src/features/auth/hooks/useAuth.ts`): `AuthProvider` + `useAuth` hook, bootstrap on mount via `GET /api/auth/me`, `LoadingScreen` while bootstrapping
- Shared components (`src/shared/components/`): `Button`, `Input`, `LoadingScreen` — minimal typed props to satisfy form requirements
- `LoginForm` and `RegisterForm` — email + password fields, top-level error display
- Register → `/onboarding` redirect on success
- App entrypoint (`src/main.tsx`): `ReactDOM.createRoot`, `BrowserRouter`, `AuthProvider`, `App`
- Route wiring (`src/App.tsx`): public routes (`/login`, `/register`), protected root (`/`), onboarding (`/onboarding`), `ProtectedRoute` guard
- Component tests for `LoginForm` and `RegisterForm` using `vi.mock` on `authService`

**Out:**
- Integration/MSW auth regression suite (Task 04)
- Per-field form validation (Zod, react-hook-form, etc.)
- Non-auth feature implementation
- Full design-system component library (components are minimal — satisfy forms only)

## Architecture decisions (locked)

### HTTP transport (`src/shared/lib/http.ts`)
- Wraps `fetch` with `credentials: 'include'` on every request.
- Reads a module-level `_csrfToken: string | null` and sets `X-CSRF-Token` header on mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`).
- Exports `setCsrfToken(token: string)` and `clearCsrfToken()` — called by the auth service, not by components.
- On 401 response: if `_refreshInFlight` is null, call `POST /api/auth/refresh`, store the promise in `_refreshInFlight`, and replay the original request on success. Subsequent 401s during the inflight window await the same promise. Set `_refreshInFlight = null` after resolution or rejection.
- On refresh failure: call `clearCsrfToken()` and re-throw so `AuthProvider` can clear user state.

### CSRF token storage
Module-level variable in `http.ts`. Not React state (avoids re-renders), not `localStorage` (XSS-accessible). Survives component remounts. Requires explicit `clearCsrfToken()` in `afterEach` for tests that exercise it.

### Auth types
```ts
// src/features/auth/types/auth.types.ts
export interface User {
  id: number;
  email: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  csrf_token: string;
}
```
`AuthResponse` is returned by `POST /api/auth/login` and `POST /api/auth/refresh`. The auth service calls `setCsrfToken` with this value.

### Auth service (`src/features/auth/services/authService.ts`)
```ts
login(creds: LoginRequest): Promise<void>      // calls setCsrfToken on success
register(creds: RegisterRequest): Promise<void> // calls setCsrfToken on success
logout(): Promise<void>                         // calls clearCsrfToken on success
me(): Promise<User>
```
Errors propagate as thrown values (plain `Error` with `.message` from the API response); forms catch and display them.

### Auth context (`src/features/auth/hooks/useAuth.ts`)
Exports:
- `AuthProvider`: React component that bootstraps session on mount (`me()` → set user, catch → user stays null), sets `isLoading = true` during bootstrap, renders `<LoadingScreen />` while loading.
- `useAuth()`: hook returning `{ user: User | null, isLoading: boolean, login, register, logout }`. Throws if used outside `AuthProvider`.

`login` and `register` on the context call `authService`, then update `user` state. `logout` calls `authService.logout`, then sets `user` to null.

### Route structure
```
/login       → <LoginForm>   (public; redirects to / if already authenticated)
/register    → <RegisterForm> (public; redirects to / if already authenticated)
/onboarding  → OnboardingPage stub (protected)
/            → App shell stub (protected)
*            → redirect to /login
```

`ProtectedRoute` behaviour: if `!user` and `!isLoading`, render `<Navigate to="/login" state={{ from: location }} replace />`. Login form reads `location.state?.from` after success and navigates there, falling back to `/`.

### Shared components — prop interfaces
```ts
Button:      { children: ReactNode; type?: 'button' | 'submit'; disabled?: boolean; isLoading?: boolean; onClick?: () => void }
Input:       { label: string; id: string; type?: string; value: string; onChange: (e) => void; error?: string }
LoadingScreen: no props — full-screen centered spinner
```
`Input` must associate label via `htmlFor={id}` so tests can query `getByRole('textbox', { name: '...' })`.

### Forms
- `LoginForm`: email + password fields, submit calls `authService.login` (via context), on success navigate to `location.state?.from ?? '/'`, on error display error message.
- `RegisterForm`: email + password fields only, submit calls `authService.register` (via context), on success navigate to `/onboarding`, on error display error message.
- Error display: a single top-level `<p role="alert">` per form. No per-field inline validation.

### Component test strategy
Use `vi.mock('@/features/auth/services/authService')` — do not use MSW in this task (that is Task 04's domain). Wrap test renders in `MemoryRouter` + `AuthProvider`. Query elements by accessible role/label (`getByRole`, `getByLabelText`). Do not rely on `data-testid` as the primary selector.

### Vitest config
Add `test` block to `vite.config.ts`:
```ts
test: {
  environment: 'jsdom',
  setupFiles: ['./src/shared/tests/setup.ts'],
  globals: true,
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
}
```

## Deliverables checklist
- [ ] `vite.config.ts` — vitest block added
- [ ] `src/shared/tests/setup.ts` — jest-dom import
- [ ] `src/shared/lib/http.ts` — fetch wrapper, CSRF module state, single-flight refresh
- [ ] `src/features/auth/types/auth.types.ts` — `User`, `LoginRequest`, `RegisterRequest`, `AuthResponse`
- [ ] `src/features/auth/services/authService.ts` — `login`, `register`, `logout`, `me`
- [ ] `src/features/auth/hooks/useAuth.ts` — `AuthProvider`, `useAuth`
- [ ] `src/shared/components/Button.tsx` — typed props
- [ ] `src/shared/components/Input.tsx` — typed props, associated label
- [ ] `src/shared/components/LoadingScreen.tsx` — full-screen spinner
- [ ] `src/features/auth/components/LoginForm.tsx` — form + error display
- [ ] `src/features/auth/components/RegisterForm.tsx` — form + error display + onboarding redirect
- [ ] `src/main.tsx` — React entrypoint with Router + AuthProvider + App
- [ ] `src/App.tsx` — route wiring with ProtectedRoute
- [ ] `src/features/auth/tests/LoginForm.test.tsx` — component tests
- [ ] `src/features/auth/tests/RegisterForm.test.tsx` — component tests

## Dependencies
- Depends on Task 02

## Acceptance criteria
- [ ] `vite.config.ts` includes vitest config (`jsdom`, `setupFiles`, `@/*` alias).
- [ ] `src/shared/tests/setup.ts` exists and imports `@testing-library/jest-dom`.
- [ ] `http.ts` sends `credentials: 'include'` on every request.
- [ ] `http.ts` sends `X-CSRF-Token` header on mutating requests when token is set.
- [ ] `http.ts` attempts one refresh on 401 using a single-flight promise; does not fire two refresh requests for concurrent 401s.
- [ ] On refresh failure, CSRF token is cleared and error propagates.
- [ ] Auth service calls `setCsrfToken` after login and register; calls `clearCsrfToken` after logout.
- [ ] `AuthProvider` calls `me()` on mount; shows `LoadingScreen` while bootstrapping; sets `user` to null if `me()` fails.
- [ ] `useAuth()` throws if called outside `AuthProvider`.
- [ ] `LoginForm` submits to `authService.login` and redirects to `location.state?.from ?? '/'` on success.
- [ ] `LoginForm` displays a `role="alert"` error on failure.
- [ ] `RegisterForm` submits to `authService.register` and redirects to `/onboarding` on success.
- [ ] `RegisterForm` displays a `role="alert"` error on failure.
- [ ] `ProtectedRoute` redirects unauthenticated users to `/login` with `state={{ from: location }}`.
- [ ] Public routes (`/login`, `/register`) redirect authenticated users to `/`.
- [ ] `main.tsx` mounts the app with `BrowserRouter > AuthProvider > App`.
- [ ] `LoginForm` component tests exist, pass, and use `vi.mock` on `authService`.
- [ ] `RegisterForm` component tests exist, pass, and use `vi.mock` on `authService`.
- [ ] No MSW usage in this task's tests.
- [ ] `npx tsc --noEmit`, `npx eslint src/`, `npx vitest run`, and `npm run build` all pass.

## Verification
```bash
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```

## PR checklist
- [ ] PR references this issue (`Closes #4`)
- [ ] Docs updated if needed (architecture/patterns/review checklist/ADR)
- [ ] Tests added/updated where needed
