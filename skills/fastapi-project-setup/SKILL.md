---
name: fastapi-project-setup
description: End-to-end bootstrap workflow for a FastAPI backend, Next.js TypeScript frontend, and JWT cookie authentication with CSRF protection. Use when asked to spin up a new app, scaffold production-ready boilerplate, standardize auth architecture, or establish reusable full-stack patterns quickly.
---

# FastAPI Project Setup

Use this as the single entrypoint for a new full-stack scaffold.

## Inputs

Collect these values before scaffolding. Use defaults if the user does not specify them.

- `app_name` (default: `app`)
- `backend_port` (default: `8000`)
- `frontend_port` (default: `3000`)
- `deployment_topology` (default: `cross-domain`)
- `database_url` (default: local Postgres DSN)

## Workflow

1. Create the base folder layout using `templates/fastapi/project-tree.txt`.
2. Apply backend setup from `modules/fastapi-project-setup.md`.
3. Apply frontend component/API setup from `modules/nextjs-typescript-component-pattern.md`.
4. Apply auth flow from `modules/jwt-auth-implementation.md`.
5. Use templates under `templates/jwt-auth/` and `templates/nextjs/` as initial implementation units.
6. Enforce acceptance checks before declaring scaffold complete.

## Required Defaults

- Prefer async SQLAlchemy 2.0 and Pydantic v2 patterns.
- Use `PyJWT`, not `python-jose`.
- Use httpOnly cookie auth with refresh token rotation.
- Use CSRF double-submit with split-token response body for cross-domain clients.
- Keep Bearer fallback for Swagger/API clients.
- Use strict CORS allowlists and security headers.

## Acceptance Checks

- Backend has clear `api`, `core`, `crud`, `models`, `schemas`, `services`, `tests` structure.
- Frontend has typed API client and typed API response contracts.
- Auth includes login, refresh, logout, me endpoints plus dependencies/cookie helpers.
- CSRF behavior is defined and tested for cookie-auth mutating requests.
- 401 refresh-retry flow is implemented once in frontend API client.

## Modules

- Backend scaffold: `modules/fastapi-project-setup.md`
- Next.js patterns: `modules/nextjs-typescript-component-pattern.md`
- JWT auth setup: `modules/jwt-auth-implementation.md`

## References

- Backend hardening: `references/fastapi-security-baseline.md`
- Frontend checklist: `references/nextjs-component-checklist.md`
- Auth sequence: `references/jwt-cookie-auth-flow.md`
