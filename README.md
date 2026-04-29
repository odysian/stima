# Stima

Stima is a mobile-first quoting app for solo tradespeople. It turns rough job notes into a saved draft quote that can be refined, shared, emailed, and converted into an invoice.

Its main idea is simple: **capture first, refine second**. Instead of pushing the user through a heavier quote-builder flow up front, Stima is designed to get from “I just talked through the job” to “I have a usable draft” as quickly as possible, while still giving the user a clear review step before anything becomes client-facing.

**Live Demo:** https://stima.odysian.dev/

## What It Does

- Capture job details by voice, text, or both
- Extract line items into a persisted draft quote
- Recover draft capture state and resume unfinished work later
- Review and refine pricing, notes, customer details, and line items
- Show extraction issues clearly so review stays trustworthy
- Generate PDFs, share public quote links, and send quotes by email
- Convert approved quotes into invoices

## Highlights

- **Quick-capture workflow**
  Stima is built around a faster quoting flow: capture the job first, then refine the saved draft afterward.

- **Persisted draft lifecycle with recovery built for field use**
  Capture creates a real draft flow that can survive interruptions and be resumed later instead of trapping the user in a temporary one-shot path.

- **Reviewable AI-assisted extraction**
  Voice/text extraction is meant to accelerate draft creation, but the user stays in control through explicit review/edit steps and clear signals when extraction needs closer review.

- **Async document pipeline**
  Extraction, PDF generation, and email delivery run through background jobs so heavier document work is durable and recoverable instead of blocking the main request flow.

- **Production-minded app boundaries**
  The project includes cookie auth, CSRF protection, Redis-backed controls, public share flows, and deployment/infrastructure decisions that go beyond a local-only demo.

## Current Focus

Recent work has focused on making the app more trustworthy and practical in the field: stronger reconnect/auth recovery, clearer degraded extraction visibility, mixed voice + text capture support, and tighter review/edit polish around quote data.

## Tech Stack

### Backend

- FastAPI
- PostgreSQL
- SQLAlchemy
- Alembic
- Redis
- ARQ
- WeasyPrint + Jinja2
- OpenAI GPT-4o Transcribe + Anthropic Claude

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
- Extraction quality tooling exists for offline/manual evaluation of prompt and pipeline changes, but it is not part of the standard verification path.
- Stima is an actively evolving portfolio project built with internet-facing deployment concerns in mind

## License

MIT
