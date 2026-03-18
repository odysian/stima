# Module: Next.js TypeScript Component Pattern

Use this module to scaffold a maintainable Next.js frontend with a strict API boundary.

## Component Taxonomy

Use these layers:

- Route/Page container: data load orchestration + route-level state.
- Feature container: local workflow state and callbacks.
- Presentational component: rendering only, typed props, no network calls.
- Shared primitives: reusable UI atoms.

## API Boundary

- All network calls go through `frontend/lib/api.ts`.
- All request/response contracts live in `frontend/lib/api.types.ts`.
- Components never call `fetch` directly.

## State and UX Rules

- Always implement loading, error, and empty states.
- Handle auth/session errors centrally in API client.
- Avoid optimistic updates unless rollback is defined.
- Add focus and keyboard support for interactive elements.

## Scaffold Files

- `frontend/lib/api.ts`
- `frontend/lib/api.types.ts`
- `frontend/app/login/page.tsx`
- `frontend/app/register/page.tsx`
- `frontend/app/dashboard/page.tsx`

Use `../templates/nextjs/component-skeleton.tsx.template` as the default component shape.

## Verification Checklist

- Every component prop interface is explicit.
- API errors are surfaced to UI state.
- Auth redirect behavior is consistent on `401`.
- No direct token reads for httpOnly cookie credentials.
