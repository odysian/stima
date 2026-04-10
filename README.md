# Stima

Stima is a mobile-first quoting app for solo tradespeople. It turns rough job notes into a saved draft quote that can be refined, shared, emailed, and converted into an invoice.

Its main idea is simple: **capture first, refine second**. Instead of pushing the user through a heavier quote-builder flow up front, Stima is built to get from “I just talked through the job” to “I have a usable draft” as quickly as possible.

**Live Demo:** https://stima.odysian.dev/

## What It Does

- Capture job details by voice, text, or both
- Extract line items into a persisted draft quote
- Resume unfinished drafts later
- Review and refine pricing, notes, customer details, and line items
- Generate PDFs, share public quote links, and send quotes by email
- Convert approved quotes into invoices

## Highlights

- **Quick-capture workflow**
  Stima is designed around a faster quote flow: capture the job first, then refine the saved draft afterward.

- **Persisted draft lifecycle**
  Extraction creates a real draft that can be resumed later instead of leaving the user in a temporary one-shot flow.

- **Async document pipeline**
  Extraction, PDF generation, and email delivery run through background jobs so heavier document work is durable and recoverable.

- **Production-minded app boundaries**
  The project includes cookie auth, CSRF protection, Redis-backed controls, public share flows, and deployment/infrastructure decisions that go beyond a local-only demo.

## Tech Stack

### Backend
- FastAPI
- PostgreSQL
- SQLAlchemy
- Alembic
- Redis
- ARQ
- WeasyPrint + Jinja2
- OpenAI Whisper + Anthropic Claude

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS v4

### Infrastructure
- Vercel frontend
- GCP VM + NGINX backend
- Cloud SQL PostgreSQL
- GCS asset storage

## Local Development

### Requirements
- Python 3.13
- Node 24.0.0
- Docker

### Run locally
1. Copy the backend and frontend env examples into local env files.
2. Start local services:
   ```bash
   docker compose up -d
   ```
3. Set up the backend virtual environment and install dependencies:
   ```bash
   cd backend
   python3 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   ```
4. Run the backend:
   ```bash
   .venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
5. Install frontend dependencies and run the app:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## Notes

- Local audio handling requires `ffmpeg`
- Redis-backed controls support production-style rate limiting and async workflows
- Stima is an actively evolving portfolio project built with internet-facing deployment concerns in mind

## License

MIT
