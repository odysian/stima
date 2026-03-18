# Module: FastAPI Project Setup

Scaffold a production-ready FastAPI backend with explicit boundaries.

## Directory Baseline

Create these folders first:

- `backend/app/api`
- `backend/app/core`
- `backend/app/crud`
- `backend/app/models`
- `backend/app/schemas`
- `backend/app/services`
- `backend/tests`

## Core Files to Create

- `backend/app/main.py`
- `backend/app/config.py` or `backend/app/core/config.py`
- `backend/app/database.py` or `backend/app/core/database.py`
- `backend/app/api/dependencies.py`
- `backend/app/api/auth.py`
- `backend/tests/conftest.py`
- `backend/tests/test_auth.py`

## Architecture Rules

- Keep routers thin. Put business logic in services/crud.
- Use async DB sessions everywhere in request paths.
- Validate input at schema boundaries.
- Make auth explicit in dependencies.
- Keep module names predictable (`auth.py`, `documents.py`, `users.py`).

## Security Baseline

Apply all items from `../references/fastapi-security-baseline.md`.

## Verification Checklist

- App boots with no import cycles.
- Protected routes reject missing/invalid auth.
- CORS uses explicit origins/methods/headers.
- Security headers middleware is active.
- Auth rate limits are set.

## Common Failure Modes

- Lazy-loading ORM relations in async context without proper loading options.
- Catching broad exceptions in auth paths.
- Using wildcard CORS config in production profile.
- Storing long-lived secrets in source files.
