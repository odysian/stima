# Stima V0 Roadmap

**Version:** 1.0 — March 2026
**Status:** Active
**Tracks against:** `docs/Stima_V0_Vertical_Slice_Spec.md` (sections 14–15) and `docs/Stima_Project_Setup_v1.1.md`

---

## Purpose

This document is the ordering contract for all V0 work. Agents read this before planning
individual tasks or specs. It defines what is built, in what order, and why — including
coupling constraints, decision locks that must happen before implementation, and known
pre-conditions each task inherits from the previous one.

---

## Current State (as of this writing)

### Built and tested
- Full auth backend: register, login, logout, refresh, `/me`, CSRF double-submit,
  httpOnly cookie rotation, argon2id hashing, rate limiting
- Full auth frontend: `LoginForm`, `RegisterForm`, `useAuth` / `AuthProvider`,
  `authService`, `http.ts` transport with single-flight refresh, full test coverage
  (component + integration + transport layers)

### Scaffolded but stub/empty
- Backend feature modules: `customers`, `profile`, `quotes` — all `"""TODO: Stub module"""`
- Backend integrations: `audio.py`, `extraction.py`, `pdf.py`, `transcription.py` —
  code is written per the setup doc but not wired to any route
- Frontend quote screens: `CaptureScreen` (returns null), `ReviewScreen`, `LineItemRow`,
  `QuoteList` — all empty or placeholder
- Frontend customer feature: `.gitkeep` files only
- `App.tsx` routes: `/login`, `/register`, `/onboarding` (placeholder div), `/` (placeholder shell)
- `backend/app/templates/quote.html` — exists but unverified against the rendering pipeline

### Migrations applied
- `users` table: `id`, `email`, `password_hash`, `first_name`, `last_name`,
  `phone_number`, `is_active`, `created_at`, `updated_at`
- `refresh_tokens` table

### Schema gap (action required in Task 1)
The current `users` table uses generic `first_name`/`last_name` fields from the auth
implementation. The spec requires `business_name`, `owner_name`, `trade_type` for the
onboarding flow and PDF rendering. Task 1 must add these via a new migration.
Decide at Task 1 kickoff whether to keep or drop `first_name`/`last_name` — they are
not required by the spec but removing them is a migration-level destructive change.
The safer default is to add the business fields and leave the name fields nullable.

Tables not yet migrated: `customers`, `documents`, `line_items`, `event_logs`.

---

## Ordered Task List

### Task 1 — Onboarding + Profile
**Mode:** `single` | **Slice:** 0

**Why this first:** The onboarding form is the gating condition for the rest of the app.
`business_name` renders in the PDF. The profile endpoint is the same `PATCH /api/profile`
call the settings screen will reuse. Building them separately creates a task boundary
inside one form and one API call.

**Backend scope:**
- New migration: add `business_name VARCHAR(255)`, `owner_name VARCHAR(255)`,
  `trade_type VARCHAR(50)` to `users` (all nullable in DB, enforced by app logic)
- Wire `GET /api/profile` and `PATCH /api/profile` with `get_current_user` dependency
- Add onboarding completion check: user is considered "onboarded" when all three
  business fields are non-null/non-empty
- `get_current_user` or a middleware layer should expose `is_onboarded` so the
  frontend can gate access

**Frontend scope:**
- Replace the `/onboarding` placeholder with a real form:
  `Business name` (required), `Owner name` (required), `Trade type` (required,
  default = Landscaping)
- After submit, redirect to `/`
- `ProtectedRoute` (or `AuthProvider`) should redirect authenticated-but-not-onboarded
  users to `/onboarding`, blocking access to the main app until complete
- `/onboarding` should be inaccessible to users who have already onboarded

**Tests:** Profile PATCH happy path, onboarding redirect logic, onboarding form
renders and submits correctly. Component test for onboarding form; integration test
for `PATCH /api/profile` via MSW.

**DoD gate for Task 2:** A registered user can complete onboarding and land on
the (still placeholder) home screen. `business_name` is readable from `GET /api/profile`.

---

### Task 2 — Customer Select / Create
**Mode:** `single` | **Slice:** 0

**Why here:** Every quote needs a `customer_id`. This is the first screen in the new
quote flow. It must exist before Task 3 can build anything end-to-end.

**Backend scope:**
- New migration: `customers` table (`id`, `user_id FK`, `name`, `phone`, `email`,
  `address`, `created_at`, `updated_at`)
- Register model in `backend/app/features/registry.py`
- Wire `GET /api/customers`, `POST /api/customers`, `GET /api/customers/:id`,
  `PATCH /api/customers/:id` with `get_current_user`
- Customers are scoped to the authenticated user (`WHERE user_id = current_user.id`)
- Only `name` is required; `phone`, `email`, `address` are optional

**Frontend scope:**
- Customer select screen: search existing customers + add new customer inline on the
  same screen (not a separate create page — per spec Screen 4)
- This screen is entered from "New Quote" (which does not exist yet as a real button;
  a placeholder route or modal trigger is fine for now)
- Selected customer is passed forward to the capture screen (routing or state)

**Tests:** Customer CRUD happy path and auth isolation (user A cannot see user B's
customers). Frontend: search renders results, inline create form submits and selects
the new customer.

**DoD gate for Task 3:** A customer can be created and selected. `customer_id` is
available to pass into quote creation.

---

### Task 3 — Quote Drafting (Gated Spec)
**Mode:** `gated` (two tasks: 3A backend, 3B frontend) | **Slice:** 0

**Why gated:** The extraction output schema is the contract between backend and
frontend. If both tasks run simultaneously, contract drift is likely. Backend locks
the schema first; frontend builds against it via MSW.

**Pre-condition: Decision Lock Document**
Before Task 3A begins, produce a short decision lock (update `docs/ARCHITECTURE.md`
or a dedicated ADR) that fixes:
1. `ExtractionResult` schema fields and nullability (`line_items`, `total`, `confidence_notes`)
2. Quote number format: **Q-001**, sequential per-user integer (already resolved in spec;
   implementation uses `MAX(doc_number)` + increment)
3. Status transition sequence and triggers:
   - `draft` — created on `POST /api/quotes`
   - `ready` — set on `POST /api/quotes/:id/pdf`
   - `shared` — set on `POST /api/quotes/:id/share`
4. Editable total behavior: yes, total is independently editable in the review screen

#### Task 3A — Backend: Extraction + Quote CRUD
**Depends on:** Task 2 (customer exists, `customer_id` available)

**Migrations:**
- `documents` table (`id`, `user_id FK`, `customer_id FK`, `doc_type DEFAULT 'quote'`,
  `doc_number VARCHAR(20)`, `status DEFAULT 'draft'`, `transcript TEXT`,
  `source_type VARCHAR(20)`, `subtotal`, `total_amount`, `notes`, `pdf_url NULL`,
  `shared_at NULL`, `created_at`, `updated_at`)
- `line_items` table (`id`, `document_id FK`, `description`, `details NULL`,
  `price DECIMAL NULL`, `sort_order INTEGER DEFAULT 0`, `created_at`, `updated_at`)
- Register both models in `backend/app/features/registry.py`

**Endpoint scope:**
- `POST /api/quotes/convert-notes` — accepts `{ notes: str }`, runs extraction
  integration, returns `{ transcript, line_items, total, confidence_notes }`. Does
  **not** persist anything — this is a drafting call only.
- `POST /api/quotes` — creates quote from confirmed draft data. Generates `doc_number`
  (Q-001 format). Sets `status = 'draft'`. Persists document + line items.
- `GET /api/quotes` — list for authenticated user, ordered by `created_at DESC`
- `GET /api/quotes/:id` — quote detail with line items
- `PATCH /api/quotes/:id` — update line items, total, notes

**Extraction integration:** Wire `integrations/extraction.py` into the
`convert-notes` route. The integration module code is already written per the setup
doc — the task is wiring it to the route and writing tests against it.

**Transcript fixture library (hard deliverable, not optional):**
`backend/app/features/quotes/tests/fixtures/transcripts.py` must contain all six
fixtures from the setup doc: `clean_with_total`, `clean_no_prices`, `total_only`,
`partial_ambiguous`, `noisy_with_hesitation`, `no_pricing_at_all`. Extraction tests
run against all six with mocked Claude responses. These tests are a Task 3A DoD item.

**Extraction tests must cover:**
- Null pricing: no zero-fill, no invented prices
- Total-only input: total preserved, all line item prices null
- Ambiguous input: returns something rather than crashing
- Malformed/partial JSON from Claude: caught and surfaced as a handled error, not a 500

**Task 3A DoD gate for 3B:** `POST /api/quotes/convert-notes` returns a validated
`ExtractionResult` with the locked schema. All extraction tests pass. Schema is
documented in `docs/ARCHITECTURE.md`.

#### Task 3B — Frontend: CaptureScreen + ReviewScreen
**Depends on:** Task 3A DoD gate (locked schema, MSW handler can be written)

**CaptureScreen scope (typed notes mode only — voice deferred to Task 5):**
- Large textarea with placeholder per spec ("5 yards brown mulch, edge front beds...")
- "Generate Draft" button calls `POST /api/quotes/convert-notes`
- Staged loading state: "Extracting line items..." (this call takes time)
- On success, navigate to ReviewScreen with draft data

**ReviewScreen scope (this is the most important screen):**
- Raw transcript card at the top (read-only; shows what the system heard)
- Editable line item rows: description, details, price — all directly editable
- Null/unknown prices show as empty field, not `$0.00`
- Add line item, delete line item
- Editable total field (independent of line item sum — per confirmed decision)
- "Generate Quote PDF" CTA — disabled until at least one line item exists
- On CTA, calls `POST /api/quotes` with customer + draft data, then navigates to
  QuotePreview (which is a placeholder until Task 4)

**Tests (required from day one per setup doc):**
- Renders line items from mocked extraction response
- Null price shows empty field, not `$0.00`
- User can edit a line item description
- User can delete a line item
- Generate PDF button disabled until at least one line item exists
- Staged loading state renders during extraction call

**Note on customer flow:** At this point the customer select screen (Task 2) must
be integrated into the "New Quote" path. `App.tsx` needs a real `/quotes/new` route
or modal flow: customer select → capture → review.

---

### Task 4 — PDF Generation + Preview + Share
**Mode:** `single` | **Slice:** 0

**Why here:** A PDF that looks professional is part of the core product per the spec
("not a polish item"). Once the review screen can call `POST /api/quotes`, the next
thing a user needs is to see and share the result.

**Backend scope:**
- `POST /api/quotes/:id/pdf` — render PDF via `integrations/pdf.py` (WeasyPrint +
  Jinja2), stream directly as `application/pdf` response
  (`Content-Disposition: inline; filename="quote-Q-001.pdf"`). No S3 in V0.
  Sets quote `status = 'ready'`.
- `POST /api/quotes/:id/share` — sets `status = 'shared'`, sets `shared_at`.
  Returns share metadata (for now: just confirms the action; no Twilio/email in V0).
- Verify WeasyPrint system dependencies work in the local dev environment
  (pango/harfbuzz; ffmpeg is not needed yet). Document any local setup step in README.

**`quote.html` template scope:**
The template already exists but should be reviewed and made genuinely professional:
- Business name + owner name (from user profile)
- Customer name (+ phone/email/address if present)
- Quote number and date
- Line items table: description, details, price (blank cell for null prices, not $0.00)
- Total row
- Use inline CSS only; no web fonts (WeasyPrint limitation); system fonts only
- Must look clean enough that a tradesperson sends it without embarrassment

**Frontend scope:**
- `QuotePreview` screen: renders PDF inline (iframe or embed) or a structured
  preview if browser PDF embed is unreliable on mobile
- "Share" button: calls `navigator.share()` when supported (mobile), with PDF blob
- "Download PDF" fallback for desktop / unsupported browsers
- "Back to Edit" link returns to ReviewScreen

**Tests:** PDF endpoint returns `application/pdf` with correct headers. Status
transitions: `draft → ready` on PDF generation, `ready → shared` on share call.
Frontend: share button calls `navigator.share()` when available, download fallback
renders otherwise.

**DoD gate:** A user can complete the full path: onboarding → customer → capture
(typed notes) → review/edit → generate → see PDF → share or download.
This is the end of Slice 0.

---

### Task 4.5 — Extraction Live Validation
**Mode:** `single` | **Slice:** 0.5

**Why between Task 4 and Task 5:** Voice capture introduces transcription noise and
format variance. Before adding that input layer, we validate the real extraction
prompt against all transcript fixtures with the production integration path.

**Backend scope:**
- Add a dedicated live test module at
  `backend/app/features/quotes/tests/test_extraction_live.py`
- Use real `ExtractionIntegration` with settings-driven model/key
  (`ANTHROPIC_API_KEY`, `EXTRACTION_MODEL`)
- Add six fixture-specific assertions for null semantics and totals:
  `clean_with_total`, `clean_no_prices`, `total_only`, `partial_ambiguous`,
  `noisy_with_hesitation`, `no_pricing_at_all`
- Print per-fixture report cards in test output for human review
- Register pytest marker `live` in `backend/pytest.ini`

**Tooling scope:**
- `make backend-verify` excludes live tests via `pytest -m "not live"`
- Add `make extraction-live` to run only live extraction tests with `-m live -s -v`
- Keep live tests out of normal CI/verify runs

**DoD gate for Task 5:** `make extraction-live` is available and validates all six
fixtures against real Claude responses, while `make backend-verify` remains offline-safe.

---

### Task 5 — Voice Capture
**Mode:** `single` | **Slice:** 1

**Why deferred until after Task 4:** The spec (section 15) explicitly recommends
validating the typed-notes extraction loop before adding audio complexity. Browser
audio format variance (WebM on Chrome, MP4 on Safari/iOS) makes audio the hardest
part to debug. Once extraction and review are proven, audio becomes an input layer
on top of a known-good system.

**Backend scope:**
- `POST /api/quotes/capture-audio` — accepts one or more raw audio clips as
  multipart form data, runs `integrations/audio.py` (pydub normalization + stitch),
  then `integrations/transcription.py` (Whisper), then `integrations/extraction.py`
  (Claude). Returns same shape as `convert-notes`: `{ transcript, line_items, total }`.
- ffmpeg must be available (add local setup note to README if not already there).
- Reject empty or zero-length clips before hitting Whisper (clean error, not 500).
- Unsupported audio format triggers a clean error (not 500).

**Frontend scope:**
- Extend `CaptureScreen` with voice mode as the primary input:
  - Large record/stop button
  - Timer while recording
  - List of captured clips with per-clip delete
  - "Start Over" action
  - "Generate Draft" button active after at least one clip
- `useVoiceCapture.ts` hook (stub exists, needs implementation): manages MediaRecorder
  lifecycle, clip accumulation, upload
- Typed notes remains as a fallback mode (tab or toggle)
- Voice clips are uploaded as-is; no frontend stitching

**Tests:** Single clip upload succeeds. Multiple clips stitched server-side. Empty
clip rejected. Unsupported format handled cleanly. Hook test: records clips,
accumulates list, clears on start-over.

---

### Task 6 — Quote List / Home Screen
**Mode:** `single` | **Slice:** 1

**Why Slice 1, not 0:** The spec (section 14, "Nice to Have Later") explicitly
defers the polished home screen. The end-to-end loop (Task 4 DoD) does not require
a list to be proven — a user can navigate directly to a quote. The list is needed
before pilot testing but not before the core loop is validated.

**Backend scope:**
- `GET /api/quotes` already wired in Task 3A. Ensure it returns pagination-friendly
  data (ordered by `created_at DESC`; page/limit params optional for V0).
- `GET /api/quotes/:id` detail endpoint also from Task 3A.

**Frontend scope:**
- Replace the `/` placeholder shell with a real `QuoteList` / Home screen
- Each row: customer name, quote date, total amount, status badge (draft/ready/shared)
- Search bar (filter by customer name or quote number)
- Floating "New Quote" button → `/quotes/new` flow
- Settings nav item (goes to `/settings`, which is a placeholder until Task 7)
- Quote row tap → Quote Detail view (reuse QuotePreview or a lightweight detail screen)

**Note:** `GET /api/quotes/:id` from Task 3A feeds the detail view. No new backend
work expected.

---

### Task 7 — Settings Screen
**Mode:** `single` | **Slice:** 1

**Why last:** `PATCH /api/profile` was built in Task 1. Task 7 is almost entirely
a frontend task — the endpoint and validation already exist. Scope accordingly:
do not introduce new backend work unless a field is genuinely missing.

**Frontend scope:**
- `/settings` route with two sections per spec (Screen 10):
  - Business profile: business name, owner name, trade type (pre-filled from profile)
  - Account: email (read-only), sign out button
- Sign out calls existing logout flow
- Form submits to `PATCH /api/profile`

**Backend scope:** Only if a settings field requires a new endpoint or model change.
Logo upload is deferred per spec.

---

## Slice 2 — Pilot Readiness (Not Individually Tasked Yet)

These items should be planned as individual tasks once Slice 1 is complete:

- **Event logging:** Single `event_logs` table with `INSERT` calls in the service
  layer. No analytics framework. Events: `quote_started`, `audio_uploaded`,
  `draft_generated`, `draft_generation_failed`, `quote_pdf_generated`, `quote_shared`.
  Fire-and-forget; do not block the main flow on log write failures.
- **Error states and loading feedback:** The extraction endpoint takes 15–30 seconds.
  Staged loading UI ("Transcribing... Extracting line items...") should be in place
  before pilot. Error states for failed extraction, failed PDF, failed audio upload.
- **Transcript visibility improvements:** Allow direct transcript editing as an optional
  correction path on the ReviewScreen (spec Screen 6: "Edit Transcript Notes").
- **Null pricing guardrails:** UI callout when line items have no price set before
  generating PDF. Not a blocker but helps the user understand what needs review.

---

## Cross-Cutting Constraints (Apply to Every Task)

### Auth on all new endpoints
Every new backend endpoint added in Tasks 1–6 uses `Depends(get_current_user)`.
Mutating endpoints (`POST`, `PATCH`) use `Depends(require_csrf)`. No exceptions
without explicit justification in the PR.

### Data scoping
All feature data is scoped to the authenticated user. Customer queries filter by
`user_id`. Quote queries filter by `user_id`. Never return another user's data.

### Migrations
- Do not modify applied migrations. Create new ones.
- Register new models in `backend/app/features/registry.py` before generating
  migrations — Alembic autogenerate depends on this.
- Migration sequence: Task 1 (business fields on users), Task 2 (customers),
  Task 3A (documents + line_items). Tasks 4–7 add no new tables.

### SQLAlchemy style
Use 2.0 style only: `Mapped[...]` / `mapped_column(...)` in models, `select()` +
async session methods in repositories. No `Column(...)` model fields, no `db.query(...)`.

### Test layer discipline
Follow the pattern established in auth:
- Component tests: `vi.mock` on service modules. No MSW, no real `fetch`.
- Integration tests: MSW against real transport chain.
- Transport tests: `vi.stubGlobal('fetch', ...)`.
Layers do not mix.

### File-size budgets
- Frontend components: target ≤250 LOC
- Frontend hooks/services: target ≤180 LOC
- Backend route/service/repository modules: target ≤220 LOC

---

## What Deferred Means

The following are explicitly out of scope for V0 and should not appear in any
Task unless the spec is updated:

- Invoices, receipts, payment processing
- Twilio SMS, SendGrid/SES email delivery
- S3/GCS file storage (PDF streamed directly in V0)
- Async job queuing (ARQ/Redis) — synchronous pipeline is acceptable for V0
- Logo upload
- Multi-user / crew accounts
- Photo gallery, AI photo notes
- CSV export, accounting integrations
- App store packaging (Capacitor)
- Subscription billing
- Full offline support
