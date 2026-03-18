# Stima — Project Setup Reference

**Version:** 1.1 — March 2026
**Status:** Pre-Build Baseline
**Purpose:** Lock in stack decisions, folder structure, pinned packages, and runtime versions before any agent touches the repo. Read this before writing a single line of code.

**Version history:**
- v1.0 — Initial draft
- v1.1 — Fixed Node pin, WeasyPrint Docker deps, broken audio sample, folder tree gaps, auth cookie topology, python-jose rationale, Tailwind v4 browser decision, agent must-read order, integration module naming

---

## 1. Framework Decision: Vite + React (not Next.js)

**Decision:** Use **Vite + React + React Router v7** for the frontend. Do not use Next.js.

**Why not Next.js:**
- Stima is a fully authenticated SPA. There are no public-facing pages, no SEO requirements, and no content that needs server-side rendering.
- Next.js provides SSR, SSG, React Server Components, and image optimization — none of which apply here.
- Quaero used Next.js and every single component required `"use client"` — meaning zero SSR benefit was captured while the full complexity cost was paid.
- Vite + React Router v7 is already battle-tested in Rostra and is the correct pattern for this type of app.

**Why Vite:**
- Leaner mental model and generally faster iteration for this SPA shape — no hydration, no server/client boundary, no "use client" directive anywhere
- Static file output deploys to Vercel or Cloudflare Pages with no server process
- No hydration mismatch errors to debug
- Simpler dev server with fast HMR

**This decision is locked. Do not let agents introduce Next.js imports, server components, or `app/` router conventions.**

---

## 2. Runtime Versions (Pin These in Repo)

```text
Python:  3.13    (pin via .python-version)
Node:    24.0.0  (pin via .nvmrc — Active LTS)
```

**Why 24.0.0:** Node 24 is Active LTS. Vite 7 requires Node 20.19+ or 22.12+ at minimum — Node 24 satisfies this comfortably and is the better long-term pin for a greenfield project.

**Files to create at repo root:**
```bash
echo "3.13" > .python-version
echo "24.0.0" > .nvmrc
```

Corrected:
```bash
echo "3.13" > .python-version
echo "24.0.0" > .nvmrc
```

Add to `frontend/package.json`:
```json
"engines": {
  "node": ">=24.0.0"
}
```

**Version policy:** The package versions listed in sections 3 and 4 are prescriptive enough to scaffold the project correctly. Once the repo is scaffolded and `package-lock.json` / a pinned `requirements.txt` are committed, those files become the operational source of truth. Do not manually update versions in this doc after scaffold — update the lockfile instead.

---

## 3. Backend Package List (`backend/requirements.txt`)

### Runtime Dependencies

```text
# Web framework
fastapi==0.135.1
uvicorn[standard]==0.40.0

# Database
SQLAlchemy==2.0.45
alembic==1.18.0
asyncpg==0.31.0
psycopg2-binary==2.9.11

# Validation / settings
pydantic==2.12.5
pydantic-settings==2.12.0
python-dotenv==1.2.1
email-validator==2.3.0
python-multipart==0.0.21

# Auth — PyJWT only. See exclusions table below.
PyJWT==2.11.0
argon2-cffi==23.1.0

# Rate limiting
slowapi==0.1.9

# AI
openai==2.15.0          # Whisper transcription endpoint
anthropic==0.76.0       # Claude extraction endpoint

# PDF generation — WeasyPrint + Jinja2 template rendering
weasyprint==65.0
jinja2==3.1.4

# Audio processing — pydub requires ffmpeg binary (see Docker section)
pydub==0.25.1
```

### Test / Dev Dependencies

```text
# Testing
httpx==0.28.1
pytest==8.3.5
pytest-asyncio==0.25.3
pytest-cov==7.0.0

# Linting / type checking / security
ruff==0.9.1
mypy==1.11.2
bandit==1.8.0
```

### What Is Intentionally Absent and Why

| Package | Reason Excluded |
|---|---|
| `python-jose` | Has CVE-2024-33663 (algorithm confusion) and CVE-2024-33664 (DoS via crafted JWE) in versions through 3.3.0, and a history of slow patching. PyJWT is sufficient for HS256 JWT handling here and carries no unnecessary JOSE dependency. |
| `passlib` | Legacy wrapper. `argon2-cffi` directly is cleaner and correct. |
| `bcrypt` | Do not use. Argon2id is the OWASP-recommended algorithm for new systems. |
| `arq` / `redis` | No background jobs or caching in V0. Add in Slice 1 if needed. |
| `pgvector` | Not needed — Stima is relational data, not vector search. |
| `pdfplumber` / `pdfminer` | Not needed — Stima generates PDFs, it does not read them. |

**`python-jose` is listed twice in previous versions of this doc because agents will try to add it. The rule stands: if it appears in requirements.txt, remove it.**

### Docker: System Dependencies

Both `pydub` (audio) and `weasyprint` (PDF) require OS-level packages. Without these, agents will produce failures that look like Python bugs but are actually missing system libraries.

Add to `backend/Dockerfile`:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz0b \
    libharfbuzz-subset0 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
```

**Why ffmpeg:** pydub uses ffmpeg for audio format conversion. Chrome records WebM/Opus, Safari/iOS records MP4/AAC. Without ffmpeg, audio normalization fails on iOS devices.

**Why the pango/harfbuzz libraries:** WeasyPrint's own documentation calls these out as required for virtualenv/container installs on Debian/Ubuntu. Without them, PDF generation silently fails or throws cryptic rendering errors.

**Why fonts-liberation:** Prevents WeasyPrint from substituting unexpected fallback fonts in generated PDFs, which would make quote templates look inconsistent across environments.

---

## 4. Frontend Package List (`frontend/package.json`)

These versions are prescriptive for scaffolding. Commit `package-lock.json` immediately after `npm install` and treat the lockfile as authoritative from that point forward.

### Runtime Dependencies

```json
{
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router-dom": "^7.2.0",
    "lucide-react": "^0.563.0"
  }
}
```

### Dev Dependencies

```json
{
  "devDependencies": {
    "@vitejs/plugin-react": "^5.1.1",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@types/node": "^24.0.0",
    "typescript": "~5.9.3",
    "tailwindcss": "^4.1.0",
    "@tailwindcss/vite": "^4.1.0",
    "vite": "^7.2.0",
    "eslint": "^9.39.0",
    "eslint-plugin-react-hooks": "^7.0.0",
    "eslint-plugin-react-refresh": "^0.4.0",
    "typescript-eslint": "^8.46.0",
    "@eslint/js": "^9.39.0",
    "globals": "^16.5.0",
    "vitest": "^3.2.0",
    "@vitest/coverage-v8": "^3.2.0",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.0",
    "@testing-library/jest-dom": "^6.9.0",
    "jsdom": "^26.1.0",
    "msw": "^2.12.0"
  }
}
```

### Tailwind v4 Browser Floor Decision

**Decision: Use Tailwind v4.**

Tailwind v4 targets Chrome 111+, Safari 16.4+, and Firefox 128+. Stima is mobile-first, targeting tradespeople using modern smartphones (iOS 16.4+ shipped March 2023, Android Chrome 111+ is widely deployed). This floor is acceptable.

If a user reports layout issues on an older device during the pilot, revisit. For V0 this is not a concern.

**MSW (Mock Service Worker) is required.** The AI extraction endpoint will be the hardest thing to test. MSW lets you mock the backend response in frontend tests without spinning up the server.

---

## 5. Folder Structure

Feature-first layout from the Greenfield Blueprint. **Start with this structure on day one.** The lesson from Quaero is that refactoring to feature-first mid-project costs a full day and introduces regression risk.

```text
stima/
├── .python-version              # "3.13"
├── .nvmrc                       # "24.0.0"
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── spec.md
│   │   └── task.md
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
│       ├── backend-test.yml
│       └── frontend-test.yml
├── docs/
│   ├── ARCHITECTURE.md
│   ├── ISSUES_WORKFLOW.md       # Execution control plane — single/gated/fast modes
│   ├── PATTERNS.md
│   ├── REVIEW_CHECKLIST.md
│   ├── learning/                # Post-PR learning handoff files
│   └── template/
│       └── KICKOFF.md
├── plans/
│   └── YYYY-MM-DD/              # Scratch whiteboards, dated and slugged
├── skills/                      # Portable agent workflow playbooks
│   ├── write-spec.md
│   ├── spec-to-issues.md
│   ├── issue-to-pr.md
│   └── spec-workflow-gh.md
├── scripts/
│   ├── gh_preflight.sh          # GitHub write preflight check
│   └── create_pr.sh             # PR creation wrapper
├── AGENTS.md                    # Canonical agent entrypoint
├── WORKFLOW.md
├── ISSUES_WORKFLOW.md           # Also at root — canonical execution control plane
├── GREENFIELD_BLUEPRINT.md
├── MIGRATION_GUIDE.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── TESTPLAN.md              # Test case definitions for agents
│   ├── conftest.py              # Shared fixtures: db_session, test_user, auth_client
│   ├── alembic/
│   │   └── versions/
│   └── app/
│       ├── main.py              # FastAPI app init, middleware, router registration
│       ├── templates/
│       │   └── quote.html       # WeasyPrint quote PDF template
│       ├── core/
│       │   ├── config.py        # Pydantic settings
│       │   ├── database.py      # Async engine, session factory, get_db
│       │   └── security.py      # PyJWT encode/decode, argon2 hash/verify
│       ├── features/
│       │   ├── auth/
│       │   │   ├── api.py
│       │   │   ├── service.py
│       │   │   ├── repository.py
│       │   │   ├── schemas.py
│       │   │   ├── models.py    # User, RefreshToken
│       │   │   └── tests/
│       │   │       └── test_auth.py
│       │   ├── customers/
│       │   │   ├── api.py
│       │   │   ├── service.py
│       │   │   ├── repository.py
│       │   │   ├── schemas.py
│       │   │   ├── models.py
│       │   │   └── tests/
│       │   │       └── test_customers.py
│       │   ├── quotes/
│       │   │   ├── api.py
│       │   │   ├── service.py
│       │   │   ├── repository.py
│       │   │   ├── schemas.py
│       │   │   ├── models.py    # Document, LineItem SQLAlchemy models
│       │   │   └── tests/
│       │   │       ├── test_quotes.py
│       │   │       ├── test_extraction.py
│       │   │       └── fixtures/
│       │   │           └── transcripts.py
│       │   └── profile/
│       │       ├── api.py
│       │       ├── service.py
│       │       ├── repository.py
│       │       └── schemas.py
│       ├── integrations/
│       │   ├── transcription.py # Audio → text (Whisper today, swappable)
│       │   ├── extraction.py    # Text → structured JSON (Claude today, swappable)
│       │   ├── pdf.py           # WeasyPrint + Jinja2 render pipeline
│       │   └── audio.py         # pydub normalization / clip stitching
│       └── shared/
│           ├── dependencies.py  # get_current_user, verify_csrf
│           └── exceptions.py    # Custom HTTPException subclasses
│
└── frontend/
    ├── index.html
    ├── vite.config.ts
    ├── tsconfig.json
    ├── package.json
    └── src/
        ├── main.tsx
        ├── App.tsx              # Route definitions
        ├── features/
        │   ├── auth/
        │   │   ├── components/
        │   │   │   ├── LoginForm.tsx
        │   │   │   └── RegisterForm.tsx
        │   │   ├── hooks/
        │   │   │   └── useAuth.ts
        │   │   ├── services/
        │   │   │   └── authService.ts
        │   │   └── types/
        │   │       └── auth.types.ts
        │   ├── customers/
        │   │   ├── components/
        │   │   ├── hooks/
        │   │   └── services/
        │   ├── quotes/
        │   │   ├── components/
        │   │   │   ├── CaptureScreen.tsx
        │   │   │   ├── ReviewScreen.tsx
        │   │   │   ├── LineItemRow.tsx
        │   │   │   └── QuoteList.tsx
        │   │   ├── hooks/
        │   │   │   ├── useVoiceCapture.ts
        │   │   │   └── useQuoteDraft.ts
        │   │   ├── services/
        │   │   │   └── quoteService.ts
        │   │   ├── types/
        │   │   │   └── quote.types.ts
        │   │   └── tests/
        │   │       ├── ReviewScreen.test.tsx
        │   │       └── LineItemRow.test.tsx
        │   └── settings/
        │       └── components/
        └── shared/
            ├── components/
            │   ├── Button.tsx
            │   ├── Input.tsx
            │   └── LoadingScreen.tsx
            ├── hooks/
            │   └── useApi.ts
            ├── lib/
            │   ├── http.ts
            │   └── api.types.ts
            └── tests/
                └── mocks/
                    ├── handlers.ts
                    └── server.ts
```

---

## 6. Auth Pattern

Follow the same pattern established in Quaero. Do not deviate.

### Token Storage
- Access token: short-lived JWT (15 minutes), stored in `httpOnly` cookie
- Refresh token: long-lived, stored in `httpOnly` cookie, hash stored in `refresh_tokens` table
- Frontend reads `csrf_token` from JSON response body and stores in `localStorage` — this is intentional and correct for the double-submit pattern

### CSRF
- Double-submit pattern: `csrf_token` returned in login/refresh JSON body, echoed as `X-CSRF-Token` header on all mutating requests
- Frontend: `credentials: "include"` on all fetch calls

### Cookie Configuration (Required Before Deployment)

These must be explicit in the backend config, not left to defaults:

```bash
COOKIE_SECURE=true          # HTTPS only — always true in production
COOKIE_HTTPONLY=true        # JS cannot read access_token or refresh_token
COOKIE_SAMESITE=lax         # "lax" for same-site subdomain setup; "none" requires Secure=true
COOKIE_DOMAIN=.stima.dev  # Set to parent domain to share across subdomains
FRONTEND_URL=https://app.stima.dev
```

### Deployment Topology Assumption

**Frontend and API are on the same site (subdomain of a shared parent domain):**
- Frontend: `app.stima.dev`
- API: `api.stima.dev`
- Cookie domain: `.stima.dev`

This is the assumption the auth pattern is built around. `SameSite=Lax` works correctly in this topology. If the frontend and API ever end up on completely different domains (e.g. Vercel default subdomain + Render default subdomain), `SameSite=None; Secure` would be required and CORS must have `allow_credentials=True` with explicit origin — which is already set in Quaero's pattern.

**For local development:** frontend runs on `localhost:5173`, API on `localhost:8000`. Use `SameSite=lax`, `Secure=false`, no `COOKIE_DOMAIN` set locally.

### Password Hashing
- Argon2id via `argon2-cffi` — not bcrypt, not pbkdf2

**[SECURITY] `python-jose` pulls in `ecdsa` which has known CVEs. It must never appear in requirements.txt.**

---

## 7. PDF Generation Pattern

Use **WeasyPrint + Jinja2**. Server-side HTML-to-PDF with no external browser dependency.

Pattern in `integrations/pdf.py`:

```python
from pathlib import Path
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML
from fastapi.responses import Response

_TEMPLATE_DIR = Path(__file__).parent.parent / "templates"
_env = Environment(loader=FileSystemLoader(str(_TEMPLATE_DIR)))


def render_quote_pdf(quote_data: dict) -> bytes:
    template = _env.get_template("quote.html")
    html_string = template.render(**quote_data)
    return HTML(string=html_string).write_pdf()


# In the route handler:
# pdf_bytes = render_quote_pdf(quote_data)
# return Response(
#     content=pdf_bytes,
#     media_type="application/pdf",
#     headers={"Content-Disposition": f'inline; filename="quote-{doc_number}.pdf"'}
# )
```

Templates live in `backend/app/templates/`. Start with one: `quote.html`. Keep CSS inline in the template for V0 — no external stylesheets, no web fonts (use system fonts to avoid font loading issues in WeasyPrint).

**Do not use pdfkit** (wraps unmaintained wkhtmltopdf). **Do not use ReportLab** (programmatic canvas model is hard to maintain for template-based documents). **Do not use Playwright** (overkill — the quote template has no JavaScript).

---

## 8. Audio Pipeline Pattern

`integrations/audio.py` — normalizes and stitches raw clips before transcription.

```python
from pydub import AudioSegment
import io


def normalize_and_stitch(audio_clips: list[bytes]) -> bytes:
    """
    Accepts raw audio clip bytes in any format (WebM, MP4, etc.),
    normalizes each clip, stitches them with 500ms silence between clips,
    and returns combined WAV bytes ready for transcription.

    Requires ffmpeg installed at OS level (see Dockerfile).
    """
    if not audio_clips:
        raise ValueError("No audio clips provided")

    segments = [
        AudioSegment.from_file(io.BytesIO(clip))
        for clip in audio_clips
    ]

    combined = segments[0]
    for segment in segments[1:]:
        combined += AudioSegment.silent(duration=500)
        combined += segment

    output = io.BytesIO()
    combined.export(output, format="wav")
    return output.getvalue()
```

`integrations/transcription.py` — sends normalized audio to Whisper. Named `transcription.py` rather than `whisper.py` so the model choice can change without a rename.

```python
from openai import AsyncOpenAI
import io

_client = AsyncOpenAI()


async def transcribe(audio_bytes: bytes) -> str:
    """Transcribe audio bytes to text via Whisper API."""
    response = await _client.audio.transcriptions.create(
        model="whisper-1",
        file=("audio.wav", io.BytesIO(audio_bytes), "audio/wav"),
    )
    return response.text
```

---

## 9. Extraction Pattern

`integrations/extraction.py` — sends transcript to Claude and returns validated structured JSON. Named `extraction.py` rather than `claude.py` so the model choice can change without a rename.

### Validation is Required

Claude output must be parsed and validated against a schema before storing or returning it. Never pass raw model output to the database or frontend. A malformed Claude response must produce a handled error, not a 500.

V0 uses prompt-enforced JSON. If extraction reliability becomes a problem in Slice 1, upgrade to provider-native structured outputs. Do not add that complexity before the basic loop is proven.

```python
from anthropic import AsyncAnthropic
from pydantic import BaseModel, field_validator
import json

_client = AsyncAnthropic()

EXTRACTION_SYSTEM_PROMPT = """
You are a quote extraction assistant for a landscaping business tool.

Given a voice transcript or rough text notes from a landscaper, extract structured quote data.

Rules:
1. Separate each distinct service or material into its own line item.
2. Rewrite trade shorthand into clean, customer-facing language.
3. If only a total is stated, preserve the total and set all line item prices to null.
4. If no pricing is given for a specific item, return null for that price — never invent prices.
5. If a detail is ambiguous, preserve the original wording rather than inventing specificity.
6. Return valid JSON only. No preamble, no explanation, no markdown fences.

Output format:
{
  "line_items": [
    {"description": "string", "details": "string or null", "price": number or null}
  ],
  "total": number or null,
  "confidence_notes": ["optional strings flagging ambiguity for internal logging"]
}
"""


class LineItemDraft(BaseModel):
    description: str
    details: str | None = None
    price: float | None = None


class ExtractionResult(BaseModel):
    line_items: list[LineItemDraft]
    total: float | None = None
    confidence_notes: list[str] = []

    @field_validator("line_items")
    @classmethod
    def must_have_at_least_one(cls, v: list) -> list:
        if not v:
            raise ValueError("Extraction returned no line items")
        return v


async def extract_quote_draft(transcript: str) -> ExtractionResult:
    """Extract structured quote draft from transcript. Raises ValueError on bad output."""
    response = await _client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        system=EXTRACTION_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": transcript}],
    )
    raw = response.content[0].text
    try:
        data = json.loads(raw)
        return ExtractionResult(**data)
    except (json.JSONDecodeError, ValueError) as e:
        raise ValueError(f"Extraction output invalid: {e}\nRaw output: {raw[:200]}")
```

---

## 10. Testing Baseline

### Backend Test Structure

```text
backend/app/features/<feature>/tests/test_<feature>.py
backend/TESTPLAN.md   ← agents read this before implementing tests
backend/conftest.py   ← shared fixtures
```

**Required fixtures from day one:**
```python
@pytest.fixture
async def db_session(): ...          # Transactional rollback (Quaero pattern)
@pytest.fixture
async def test_user(db_session): ... # Factory with randomized email
@pytest.fixture
async def auth_client(test_user): .. # AsyncClient with auth cookies set
```

### Transcript Fixture Library

Create `backend/app/features/quotes/tests/fixtures/transcripts.py` on day one:

```python
TRANSCRIPTS = {
    "clean_with_total": "5 yards brown mulch, edge front beds, trim 8 shrubs, haul brush, around 650 total.",
    "clean_no_prices": "Spring cleanup, cut back ornamental grasses, weed front beds.",
    "total_only": "Lawn cleanup, around 425.",
    "partial_ambiguous": "Do the beds and stuff in the back, maybe some mulch, six hundred or so.",
    "noisy_with_hesitation": "Um, so, five yards of, uh, brown mulch, and edge the, the front beds, trim maybe eight shrubs.",
    "no_pricing_at_all": "Mow front and back, edge driveway, blow off patio.",
}
```

Run extraction tests against every fixture with mocked Claude responses. This catches prompt regressions before a real user does.

### Frontend Test Approach

Vitest + Testing Library + MSW. Tests live in `features/<feature>/tests/`.

`ReviewScreen.tsx` must have tests from day one — it is the most critical UI in the product:
- Renders line items from mocked extraction response
- Null price shows empty field, not "$0.00"
- User can edit a line item description
- User can delete a line item
- Generate PDF button disabled until at least one line item exists

---

## 11. Environment Variables

### Backend (`.env`)

```bash
# Database
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/stima

# Auth
SECRET_KEY=                        # openssl rand -hex 32
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=30

# Cookie config
COOKIE_SECURE=false                # true in production
COOKIE_SAMESITE=lax
COOKIE_DOMAIN=                     # blank for local; .stima.dev in production

# AI
OPENAI_API_KEY=                    # Whisper transcription
ANTHROPIC_API_KEY=                 # Claude extraction

# App
ENVIRONMENT=development
FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173
```

### Frontend (`.env.local`)

```bash
VITE_API_URL=http://localhost:8000
```

---

## 12. CI Baseline

Carry forward Quaero's CI pattern. Two workflows: `backend-test.yml` and `frontend-test.yml`.

**Backend CI must include:**
- `ruff check .`
- `mypy .`
- `bandit -r app/`
- `pytest` with postgres service container

**Frontend CI must include:**
- `npx tsc --noEmit`
- `npx eslint src/`
- `npx vitest run`
- `npm run build`

---

## 13. Agent Must-Read Order

Every agent session must read these files in this order before writing any code. This order matches the agentic-workflow-template contract:

1. `AGENTS.md` — canonical entrypoint, operating loop, unit of work rules
2. `ISSUES_WORKFLOW.md` — execution control plane (single/gated/fast), DoR, DoD
3. `docs/template/KICKOFF.md` — kickoff prompt contract
4. `WORKFLOW.md` — full development process

Read conditionally when relevant:
- `GREENFIELD_BLUEPRINT.md` — for greenfield setup or explicit restructuring
- `docs/ARCHITECTURE.md` — for schema and API contract changes
- `docs/PATTERNS.md` — for established conventions
- `backend/TESTPLAN.md` — before implementing any feature tests
- This file (`Stima_Project_Setup.md`) — for stack decisions and package locks

**Violations that must be rejected in review:**
- `python-jose` or `passlib` in requirements.txt
- Next.js imports or `"use client"` directives
- Flat `src/components/` folder without feature nesting
- `AudioSegment.join()` — this method does not exist, use explicit concatenation
- WeasyPrint PDF generation in a Dockerfile without the pango/harfbuzz system libs
- Raw Claude/model output returned to the frontend without schema validation
