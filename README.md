# Stima

Stima is a mobile-first quote drafting platform for solo tradespeople.

## Stack Summary
- Backend: FastAPI, SQLAlchemy, Alembic, PostgreSQL
- Frontend: Vite, React, TypeScript, Tailwind CSS v4
- AI integrations: OpenAI Whisper + Anthropic Claude
- PDF generation: WeasyPrint + Jinja2

## Local Development (Placeholder)
1. Use Python `3.13` from `.python-version` and Node `24.0.0` from `.nvmrc` / `frontend/package.json`.
2. Copy backend and frontend env examples into local env files.
3. Start local dependencies with `docker-compose up -d`.
4. Run backend and frontend dev servers.

## Voice Capture Prerequisite
- Install `ffmpeg` locally so backend audio normalization can decode browser-recorded clips.

## Dependency Security
- Backend CI installs `pip-audit` ephemerally and runs `backend/.venv/bin/pip-audit -r backend/requirements.txt`.
- Frontend CI runs `npm audit --prefix frontend --audit-level=high`.
- Document any temporary audit exceptions in `security/dependency-audit-exceptions.json` with `id`, `ecosystem`, `package`, `advisory`, `reason`, `owner`, and `expires_on`.
