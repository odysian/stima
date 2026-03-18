# Stima — Scaffold Kickoff Prompt

---

You are scaffolding a brand new greenfield repository for Stima.

This is a scaffolding-only session. Do not write any application code — no FastAPI routes, no React components, no business logic, no database models. The output of this session is a correctly structured, fully configured empty repo that a future agent can immediately start building features in.

## Required reading before you start

Read these two documents in full before creating any files:
1. `Stima_Project_Setup_v1.1.md` — stack decisions, package versions, folder structure, Docker deps, auth pattern
2. `Stima_V0_Vertical_Slice_Spec.md` — product spec for context

## Workflow scaffolding — use the template

Copy and adapt the following from the agentic-workflow-template, replacing all `{TOKEN}` placeholders with Stima context:
- `AGENTS.md`
- `WORKFLOW.md`
- `ISSUES_WORKFLOW.md`
- `GREENFIELD_BLUEPRINT.md`
- `MIGRATION_GUIDE.md`
- `docs/ISSUES_WORKFLOW.md`
- `docs/template/KICKOFF.md`
- `docs/PATTERNS.md` (stub — keep boundary contract and file-size budgets, leave project patterns as TODO)
- `docs/REVIEW_CHECKLIST.md` (stub)
- `skills/` — copy all playbooks from template as-is
- `scripts/` — copy `gh_preflight.sh` and `create_pr.sh`, make executable
- `.github/ISSUE_TEMPLATE/` — copy from template
- `.github/PULL_REQUEST_TEMPLATE.md` — copy from template

Do not rewrite these files from scratch. Use the template versions.

## Stima-specific scaffolding

These do not exist in the template and must be created fresh per `Stima_Project_Setup_v1.1.md`:

### Repo root
- `.python-version` → `3.13`
- `.nvmrc` → `24.0.0`
- `.gitignore` (include: .env, .env.local, __pycache__, *.pyc, .mypy_cache, .ruff_cache, .venv, node_modules, .next, .cursor, .DS_Store, dist, .coverage, htmlcov)
- `README.md` — project name, stack summary, placeholder local dev instructions, empty AI Review Log section
- `docker-compose.yml` — local dev only: postgres:16-alpine service, no Redis

### docs/
- `docs/ARCHITECTURE.md` — stub with section headers: Overview, Database Schema, API Contracts, Deployment
- `docs/learning/` — empty dir with .gitkeep

### plans/
- `plans/` — empty with .gitkeep, using `plans/YYYY-MM-DD/` convention per template

### backend/
- `backend/Dockerfile` — Python 3.13-slim base. Install system deps: ca-certificates, curl, ffmpeg, libpango-1.0-0, libpangoft2-1.0-0, libharfbuzz0b, libharfbuzz-subset0, fonts-liberation. Then pip install requirements.txt. Expose 8000.
- `backend/requirements.txt` — exact versions from setup doc section 3, no additions, no substitutions
- `backend/.env.example` — all vars from setup doc section 11, values blank or clearly marked as placeholder. Use `stima` as the database name.
- `backend/alembic.ini` — standard alembic config pointing to app/core/database for env
- `backend/TESTPLAN.md` — stub with section headers: Auth, Customers, Quotes (Extraction), Quotes (CRUD), Profile
- `backend/conftest.py` — stub with commented fixture signatures only, no implementation
- `backend/alembic/env.py` — valid stub importing from app.core.database with TODO comment
- `backend/alembic/versions/` — empty with .gitkeep

Full `backend/app/` directory tree — `__init__.py` files and stub modules only, no implementation:
```
backend/app/__init__.py
backend/app/main.py                          — stub: comment only
backend/app/templates/quote.html            — minimal valid HTML stub with TODO comment
backend/app/core/__init__.py
backend/app/core/config.py                  — stub
backend/app/core/database.py                — stub
backend/app/core/security.py                — stub
backend/app/features/__init__.py
backend/app/features/auth/__init__.py
backend/app/features/auth/api.py            — stub
backend/app/features/auth/service.py        — stub
backend/app/features/auth/repository.py     — stub
backend/app/features/auth/schemas.py        — stub
backend/app/features/auth/models.py         — stub
backend/app/features/auth/tests/__init__.py
backend/app/features/auth/tests/test_auth.py — stub
backend/app/features/customers/__init__.py
backend/app/features/customers/api.py       — stub
backend/app/features/customers/service.py   — stub
backend/app/features/customers/repository.py — stub
backend/app/features/customers/schemas.py   — stub
backend/app/features/customers/models.py    — stub
backend/app/features/customers/tests/__init__.py
backend/app/features/customers/tests/test_customers.py — stub
backend/app/features/quotes/__init__.py
backend/app/features/quotes/api.py          — stub
backend/app/features/quotes/service.py      — stub
backend/app/features/quotes/repository.py   — stub
backend/app/features/quotes/schemas.py      — stub
backend/app/features/quotes/models.py       — stub
backend/app/features/quotes/tests/__init__.py
backend/app/features/quotes/tests/test_quotes.py     — stub
backend/app/features/quotes/tests/test_extraction.py — stub
backend/app/features/quotes/tests/fixtures/__init__.py
backend/app/features/quotes/tests/fixtures/transcripts.py — stub
backend/app/features/profile/__init__.py
backend/app/features/profile/api.py         — stub
backend/app/features/profile/service.py     — stub
backend/app/features/profile/repository.py  — stub
backend/app/features/profile/schemas.py     — stub
backend/app/integrations/__init__.py
backend/app/integrations/transcription.py   — stub
backend/app/integrations/extraction.py      — stub
backend/app/integrations/pdf.py             — stub
backend/app/integrations/audio.py           — stub
backend/app/shared/__init__.py
backend/app/shared/dependencies.py          — stub
backend/app/shared/exceptions.py            — stub
```

### frontend/
- `frontend/package.json` — exact dependencies from setup doc section 4, `"engines": { "node": ">=24.0.0" }`. Do not run npm install.
- `frontend/vite.config.ts` — Vite + React + Tailwind v4
- `frontend/tsconfig.json` — strict mode, path alias `@/*` → `./src/*`
- `frontend/tsconfig.node.json`
- `frontend/index.html` — standard Vite HTML entry point
- `frontend/.env.example` — `VITE_API_URL=http://localhost:8000`

Full `frontend/src/` directory tree — stub files only:
```
frontend/src/main.tsx                                        — stub
frontend/src/App.tsx                                         — stub
frontend/src/features/auth/components/LoginForm.tsx          — stub
frontend/src/features/auth/components/RegisterForm.tsx       — stub
frontend/src/features/auth/hooks/useAuth.ts                  — stub
frontend/src/features/auth/services/authService.ts           — stub
frontend/src/features/auth/types/auth.types.ts               — stub
frontend/src/features/customers/                             — empty dirs with .gitkeep
frontend/src/features/quotes/components/CaptureScreen.tsx    — stub
frontend/src/features/quotes/components/ReviewScreen.tsx     — stub
frontend/src/features/quotes/components/LineItemRow.tsx      — stub
frontend/src/features/quotes/components/QuoteList.tsx        — stub
frontend/src/features/quotes/hooks/useVoiceCapture.ts        — stub
frontend/src/features/quotes/hooks/useQuoteDraft.ts          — stub
frontend/src/features/quotes/services/quoteService.ts        — stub
frontend/src/features/quotes/types/quote.types.ts            — stub
frontend/src/features/quotes/tests/ReviewScreen.test.tsx     — stub
frontend/src/features/quotes/tests/LineItemRow.test.tsx      — stub
frontend/src/features/settings/                              — empty dirs with .gitkeep
frontend/src/shared/components/Button.tsx                    — stub
frontend/src/shared/components/Input.tsx                     — stub
frontend/src/shared/components/LoadingScreen.tsx             — stub
frontend/src/shared/hooks/useApi.ts                          — stub
frontend/src/shared/lib/http.ts                              — stub
frontend/src/shared/lib/api.types.ts                         — stub
frontend/src/shared/tests/mocks/handlers.ts                  — stub
frontend/src/shared/tests/mocks/server.ts                    — stub
```

## What NOT to do
- Do not implement any application logic in any file
- Do not implement any React components beyond a stub export
- Do not run npm install or pip install
- Do not create any database migrations
- Do not write any tests beyond stub files
- Do not add any packages not listed in the setup doc
- Do not rewrite workflow docs from scratch — use the template

## Verification

Run these checks and report results before considering the task complete:

1. `grep -r "\{\{" . --include="*.md" --include="*.py" --include="*.ts" --include="*.tsx"` — must return nothing
2. `grep -i "python-jose\|passlib\|bcrypt" backend/requirements.txt` — must return nothing
3. `cat .nvmrc` — must output `24.0.0`
4. `cat .python-version` — must output `3.13`
5. `test -f backend/app/features/quotes/models.py && echo "EXISTS"` — must output EXISTS
6. `test -f backend/app/templates/quote.html && echo "EXISTS"` — must output EXISTS
7. `test -f backend/TESTPLAN.md && echo "EXISTS"` — must output EXISTS
8. `test -f docs/template/KICKOFF.md && echo "EXISTS"` — must output EXISTS

Report results for all eight checks. Do not consider the task complete until all pass.
