# Stima — V0 Vertical Slice Specification

**Version:** 4.0 — March 2026  
**Status:** Active Build Spec  
**Author:** Chris

---

## 1. Purpose of This Rewrite

This version replaces the broader MVP with a much narrower goal:

**Prove that a solo tradesperson can speak rough job notes, review an AI-generated draft quote, and share a professional PDF faster than they can build the quote manually.**

This is no longer a small “business organizer” MVP. It is a **quote-first vertical slice**.

The product should not try to solve quoting, invoicing, payments, photo documentation, receipts, exports, subscriptions, and app-store distribution all at once.

The first version only needs to answer one question:

**Is voice/text -> AI structuring -> review/edit -> shareable quote fast and reliable enough that a real user would prefer it over their current workflow?**

---

## 2. Product Definition

### Working Product Statement

Stima is a mobile-first quoting tool for solo tradespeople. It turns rough field input into a clean, professional quote draft that the user can review, edit, and share immediately.

### Core Promise

**Talk instead of type. Get a quote draft fast. Stay in control.**

### Important Framing

Stima v0 is **not** an autopilot quoting system.

It is a **draft-generation tool**.

The AI is responsible for:
- capturing rough input
- structuring it into draft line items
- preserving stated totals and details
- producing something easier to edit than starting from scratch

The AI is **not** responsible for:
- final correctness without review
- inventing missing prices
- making assumptions that were not stated
- auto-sending customer-facing documents without confirmation

---

## 3. V0 Scope

### Included in V0

- Account creation and sign-in
- Minimal onboarding
- Customer create/select
- Voice capture for quote notes
- Typed rough notes fallback
- Backend audio normalization / transcription pipeline
- AI extraction into structured line items
- Review/edit quote screen
- Quote PDF generation
- Native share flow
- Quote history
- Basic document detail view
- Event logging for validation metrics

### Explicitly Excluded from V0

- Invoices
- Receipts
- Payment processing
- Stripe / Venmo / CashApp links
- Twilio SMS sending
- SendGrid / SES delivery flows
- Viewed tracking
- Photo gallery
- AI photo notes
- CSV export
- Subscription billing / free tier logic
- Multi-user crew accounts
- Calendar / scheduling
- Accounting integrations
- App store packaging via Capacitor
- Full offline support
- Multi-trade optimization beyond the first launch trade

### Recommended Launch Vertical

**Landscaping**

Why this is the recommended first trade:
- repeatable job language
- clear materials and services
- many jobs quoted from rough field notes
- familiar shorthand that benefits from structured extraction

Examples:
- “5 yards brown mulch, edge beds, trim shrubs, haul debris, around 650 total”
- “Spring cleanup, cut back ornamental grasses, weed front beds, 425”

A second trade can be added later only after the landscaping flow works consistently.

---

## 4. Product Principles

1. **Fast first value beats completeness.**  
   The user should reach “AI generated a usable draft quote” as fast as possible.

2. **AI drafts, user approves.**  
   No quote is sent automatically. Review is always part of the flow.

3. **Do not invent prices.**  
   If the user gives only a total, preserve the total and leave uncertain line item pricing blank.

4. **Raw transcript stays visible.**  
   Users need to see what the system heard.

5. **Correction must be painless.**  
   A slightly wrong draft is acceptable. A hard-to-fix draft is not.

6. **Manual fallback is always available.**  
   Voice should accelerate the job, never block it.

7. **Mobile-first means thumb-friendly and obvious.**  
   Big tap targets, short flows, minimal setup.

---

## 5. Success Criteria

### Primary Success Metric

**% of first-session users who generate a shareable quote PDF**

### Secondary Metrics

- Median time from “New Quote” to quote-ready PDF
- Number of manual edits per quote
- % of generated quotes that are shared
- % of users who create a second quote within 7 days

### Pilot Quality Bar

Stima v0 is considered promising if:
- at least 70% of pilot quotes require only light edits
- median capture-to-PDF time is under 90 seconds
- users describe it as faster than their current process
- users do not feel the AI is “making things up”

### Failure Signals

- users abandon the flow and restart manually
- transcript quality is too unreliable in normal field conditions
- editing takes so long that the AI adds no time savings
- users do not trust the output enough to share it

---

## 6. User Persona for V0

### Primary User

A solo landscaper or small landscaping owner-operator who:
- works from a phone
- currently uses memory, texts, or handwritten notes
- wants professional-looking quotes
- does not want to learn bloated field-service software

### Behavior Assumptions

This user is not looking for “AI.”
They are looking for:
- less typing
- fewer dropped details
- faster quoting
- cleaner customer-facing output

The product wins when the user thinks:

**“That’s basically right. I only had to tweak a couple things.”**

---

## 7. Core User Flow

1. User signs in
2. User lands on Quote List / Home
3. User taps **New Quote**
4. User selects existing customer or adds a new customer
5. User records voice notes or types rough notes
6. App uploads raw input
7. Backend transcribes and extracts structured quote draft
8. User reviews transcript + line items + total
9. User edits anything needed
10. User taps **Generate Quote**
11. Backend creates PDF
12. User previews PDF
13. User taps **Share**
14. Native share sheet opens
15. Quote is saved to history

---

## 8. Screens

### Screen 0: Welcome

**Goal:** Get the user into the product with minimal friction.

**Elements:**
- App name / simple logo
- Tagline: “Speak your notes. Send a clean quote.”
- Primary button: **Create Account**
- Secondary button: **Sign In**

---

### Screen 1: Register / Sign In

**Fields:**
- Email
- Password

Keep auth simple. No unnecessary setup on this screen.

---

### Screen 2: Onboarding

**Goal:** Reach first value fast.

**Fields:**
- Business name (required)
- Owner name (required)
- Trade type (required; default/recommended = Landscaping)

**Do not ask for at onboarding:**
- logo
- phone number
- tax settings
- payment settings
- delivery preferences

Those belong in Settings later.

**CTA:**
- **Get Started**

After completion, land directly on Home.

---

### Screen 3: Home / Quote List

This is the starting point after sign-in.

**Elements:**
- Search bar
- List of recent quotes
- Each row shows:
  - customer name
  - quote date
  - total amount
  - status (draft / ready / shared)
- Floating primary action button: **New Quote**
- Secondary nav item: **Settings**

For v0, this replaces the broader customer-centric dashboard.

---

### Screen 4: Customer Select / Create

**Goal:** Attach the quote to a customer with minimal friction.

**Options:**
- Search existing customers
- Add new customer inline

**New customer fields:**
- Customer name (required)
- Phone number (optional)
- Email (optional)
- Address (optional)

Do not require address or phone just to start a quote.

---

### Screen 5: Quote Capture

**Goal:** Let the user dump rough job notes quickly.

**Two input modes:**
- Voice (primary)
- Typed rough notes (fallback)

#### Voice Mode

**Elements:**
- Large record / stop button
- Timer while recording
- List of captured clips
- Delete clip action per clip
- Start Over action
- Generate Draft button after at least one clip exists

**Important:**
Frontend should upload raw clips. It should not be responsible for concatenating audio into a final file.

#### Typed Notes Mode

**Elements:**
- Large textarea with placeholder:
  - “5 yards brown mulch, edge front beds, trim 8 shrubs, haul brush, around 650 total”
- Button: **Generate Draft**

---

### Screen 6: Quote Review / Edit

This is the most important screen in the product.

**Top section:**
- Raw transcript card
- Button: **Edit Transcript Notes** (optional if you want a quick correction path)

**Structured draft section:**
- Line item rows
- Each row has:
  - description
  - details / quantity
  - price
- Add line item
- Delete line item
- Reorder optional, but not required for first slice

**Totals section:**
- subtotal or total
- if only total was stated, preserve it visibly

**Behavior rules:**
- Never auto-fill invented prices
- Highlight null / unknown prices clearly
- Make every field directly editable

**Primary CTA:**
- **Generate Quote PDF**

---

### Screen 7: Quote Preview

**Goal:** Make the result feel professional and ready to send.

**Elements:**
- PDF preview or rendered quote preview
- Business name
- Customer name
- Quote number
- Date
- Line items
- Total
- Notes block optional

**Actions:**
- **Share**
- **Download PDF**
- **Back to Edit**

---

### Screen 8: Share Flow

V0 should avoid platform-owned delivery systems.

**Primary action:**
- Native share (`navigator.share()` when supported)

**Fallback actions:**
- Copy quote link
- Download PDF

Do not build Twilio or transactional email into v0.
The goal is to let the tradesperson send the quote using the tools they already trust.

---

### Screen 9: Quote Detail

**Goal:** Lightweight history and resend behavior.

**Show:**
- customer
- quote date
- line items
- total
- transcript snapshot or input notes
- share status

**Actions:**
- Open PDF
- Share again
- Duplicate quote (nice-to-have, optional)

---

### Screen 10: Settings

Minimal for v0.

**Sections:**
- Business profile
  - business name
  - owner name
  - trade type
  - logo upload (optional, deferred)
- Account
  - email
  - sign out

Leave tax, payment terms, and delivery defaults out unless they are truly needed for your first PDF template.

---

## 9. AI Behavior Specification

### What the AI Must Do

From a transcript or rough note block, return:
- structured line items
- preserved quantities and scope
- preserved stated total, if provided
- no invented services
- no invented pricing

### Output Target

```json
{
  "transcript": "string",
  "line_items": [
    {
      "description": "string",
      "details": "string or null",
      "price": 0.0
    }
  ],
  "total": 0.0,
  "confidence_notes": ["optional strings for internal logging"]
}
```

### Extraction Rules

1. Separate each distinct service or material into its own line item.
2. Preserve trade shorthand, but rewrite it into clean customer-facing language.
3. If only a total is given, preserve the total and set uncertain per-line pricing to null.
4. If no pricing is given, return null pricing instead of guessing.
5. If a detail is ambiguous, preserve the wording rather than inventing specificity.
6. Return structured JSON only.

### Example

**Input:**

“5 yards brown mulch, edge front beds, trim 8 shrubs, haul brush, around 650 total.”

**Desired draft:**
- Brown mulch | 5 yards | null
- Bed edging | Front beds | null
- Shrub trimming | 8 shrubs | null
- Brush hauling | null | null
- total = 650

This is acceptable because it gives the user a fast draft while avoiding false precision.

---

## 10. AI Pipeline Recommendation

### Preferred Flow

1. Capture raw audio clips or text notes
2. Upload to backend
3. Normalize / stitch audio server-side if needed
4. Run transcription
5. Store raw transcript
6. Run transcript -> structured extraction
7. Return transcript + structured line items to frontend
8. User reviews and edits
9. Create final quote record

### Why This Pipeline

This separates the problem into two debuggable stages:
- what did the system hear?
- how did it structure what it heard?

That makes failures much easier to diagnose than a single black-box “audio in, quote out” call.

---

## 11. Database Schema (V0)

### Table: `users`

```text
users
├── id               UUID, PRIMARY KEY
├── email            VARCHAR(255), UNIQUE, NOT NULL
├── password_hash    VARCHAR(255), NOT NULL
├── business_name    VARCHAR(255), NOT NULL
├── owner_name       VARCHAR(255), NOT NULL
├── trade_type       VARCHAR(50), NOT NULL
├── logo_url         VARCHAR(500), NULL
├── created_at       TIMESTAMPTZ, DEFAULT NOW()
└── updated_at       TIMESTAMPTZ, DEFAULT NOW()
```

### Table: `customers`

```text
customers
├── id               UUID, PRIMARY KEY
├── user_id          UUID, NOT NULL, FK -> users.id
├── name             VARCHAR(255), NOT NULL
├── phone            VARCHAR(20), NULL
├── email            VARCHAR(255), NULL
├── address          VARCHAR(500), NULL
├── created_at       TIMESTAMPTZ, DEFAULT NOW()
└── updated_at       TIMESTAMPTZ, DEFAULT NOW()
```

### Table: `documents`

Keep the unified document model even though v0 only uses `quote`.
This preserves the good long-term architecture without forcing invoice/receipt features now.

```text
documents
├── id               UUID, PRIMARY KEY
├── user_id          UUID, NOT NULL, FK -> users.id
├── customer_id      UUID, NOT NULL, FK -> customers.id
├── doc_type         VARCHAR(20), NOT NULL DEFAULT 'quote'
├── doc_number       VARCHAR(20), NOT NULL
├── status           VARCHAR(20), NOT NULL DEFAULT 'draft'
├── transcript       TEXT, NULL
├── source_type      VARCHAR(20), NOT NULL
├── subtotal         DECIMAL(10,2), NULL
├── total_amount     DECIMAL(10,2), NULL
├── notes            TEXT, NULL
├── pdf_url          VARCHAR(500), NULL
├── shared_at        TIMESTAMPTZ, NULL
├── created_at       TIMESTAMPTZ, DEFAULT NOW()
└── updated_at       TIMESTAMPTZ, DEFAULT NOW()
```

**Quote numbering:** `doc_number` is generated on `POST /api/quotes` as a sequential integer per user, zero-padded and prefixed: `Q-001`, `Q-002`, etc. This is not user-configurable in v0. Implementation: query `MAX(doc_number)` for the user and increment. This is not an open question.

**PDF storage in V0:** Do **not** use S3/GCS in Slice 0. Generate the PDF on `POST /api/quotes/:id/pdf` and stream it directly as a response (Content-Type: application/pdf). The frontend downloads it immediately. `pdf_url` can remain NULL until Slice 1 when persistent storage is added. This eliminates cloud storage setup from the critical path.

Recommended status values for v0:
- `draft`
- `ready`
- `shared`

Recommended source types:
- `voice`
- `typed_notes`
- `manual`

### Table: `line_items`

```text
line_items
├── id               UUID, PRIMARY KEY
├── document_id      UUID, NOT NULL, FK -> documents.id
├── description      VARCHAR(500), NOT NULL
├── details          VARCHAR(255), NULL
├── price            DECIMAL(10,2), NULL
├── sort_order       INTEGER, NOT NULL DEFAULT 0
├── created_at       TIMESTAMPTZ, DEFAULT NOW()
└── updated_at       TIMESTAMPTZ, DEFAULT NOW()
```

### Table: `refresh_tokens`

```text
refresh_tokens
├── id               UUID, PRIMARY KEY
├── user_id          UUID, NOT NULL, FK -> users.id
├── token_hash       VARCHAR(255), NOT NULL
├── expires_at       TIMESTAMPTZ, NOT NULL
├── created_at       TIMESTAMPTZ, DEFAULT NOW()
└── revoked_at       TIMESTAMPTZ, NULL
```

### Optional Table: `event_logs`

Use this if you want product validation data without bolting on full analytics immediately.

```text
event_logs
├── id               UUID, PRIMARY KEY
├── user_id          UUID, NULL
├── event_name       VARCHAR(100), NOT NULL
├── metadata_json    JSONB, NULL
├── created_at       TIMESTAMPTZ, DEFAULT NOW()
```

Suggested events:
- `quote_started`
- `audio_uploaded`
- `draft_generated`
- `draft_generation_failed`
- `quote_pdf_generated`
- `quote_shared`

---

## 12. API Endpoints (V0)

### Auth

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
```

### Profile

```text
GET    /api/profile
PATCH  /api/profile
POST   /api/profile/logo
```

### Customers

```text
GET    /api/customers
POST   /api/customers
GET    /api/customers/:id
PATCH  /api/customers/:id
```

### Quote Drafting

```text
POST   /api/quotes/capture-audio
POST   /api/quotes/convert-notes
```

`/api/quotes/capture-audio` should:
- accept one or more raw audio clips
- normalize / combine server-side if needed
- transcribe audio
- extract structured draft
- return transcript + draft line items + total

`/api/quotes/convert-notes` should:
- accept rough typed notes
- extract structured draft
- return transcript-equivalent text + line items + total

### Quotes

```text
GET    /api/quotes
POST   /api/quotes
GET    /api/quotes/:id
PATCH  /api/quotes/:id
POST   /api/quotes/:id/pdf
POST   /api/quotes/:id/share
```

Recommended meaning:
- `POST /api/quotes` creates a quote from confirmed draft data
- `POST /api/quotes/:id/pdf` renders or re-renders the PDF
- `POST /api/quotes/:id/share` logs share intent / returns share metadata

---

## 13. Technical Architecture

### Stack

| Layer | Technology | Notes |
|------|------------|-------|
| Frontend | React + TypeScript | Mobile-first web app |
| Backend | FastAPI | Fast iteration, familiar stack |
| Database | PostgreSQL | Clean fit for relational quote data |
| ORM | SQLAlchemy + Alembic | Familiar tooling |
| Transcription | OpenAI Whisper API | Audio → text; handles WebM/MP4 format variance |
| AI Extraction | Anthropic Claude API | Text transcript → structured JSON line items |
| Audio Normalization | ffmpeg (backend) | Format conversion before Whisper; required for cross-browser compatibility |
| File Storage | S3 or GCS | PDF and optional logo storage |
| PDF Generation | HTML template -> PDF | Keep template simple and professional |
| Auth | JWT access + refresh | Standard session model |
| Frontend Hosting | Vercel | Simple deploy path |
| Backend Hosting | Existing preferred cloud path | Keep ops simple |

### Delivery Decision for V0

Do **not** build Twilio SMS sending into the first version.

Use:
- native share API when supported
- copy link fallback
- PDF download fallback

This keeps the product aligned with how tradespeople already send quotes today.

### Audio Decision for V0

Do **not** rely on frontend audio concatenation as the primary architecture.

Use:
- browser recording for clip capture
- backend normalization / concatenation via **ffmpeg**
- backend transcription via **Whisper API**
- backend extraction via **Claude API**

**Why ffmpeg is required:** Chrome records WebM/Opus; Safari/iOS records MP4/AAC. ffmpeg normalizes these to a consistent format before Whisper ingestion. Without it, transcription results will be inconsistent across devices.

**Why the pipeline is synchronous in V0:** The audio endpoint (transcription + extraction) will take 15–30 seconds. For Slice 0, this is acceptable with a staged loading UI showing "Transcribing... Extracting line items..." Async job queuing (ARQ) is deferred to Slice 1 once the pipeline output quality is validated. Do not add async infrastructure before the core loop is proven.

**Two-provider split:**
- Whisper handles audio → text (OpenAI API)
- Claude handles text → structured JSON (Anthropic API)
This keeps each stage independently debuggable.

### PDF Decision for V0

A good-looking quote is part of the core product, not a polish item.

The quote template should feel:
- clean
- legible
- professional
- simple enough that a tradesperson is comfortable sending it immediately

---

## 14. Vertical Slice Build Order

### Slice 0: Prove the Core Magic

Build the smallest end-to-end version possible.

**Goal:** One user can create one customer, record notes, get a structured draft, edit it, and generate a PDF.

#### Must Have
- one working auth path or even a temporary single-user dev mode
- one customer creation form
- one audio upload endpoint
- one typed note conversion endpoint
- one structured review screen
- one quote create endpoint
- one quote PDF render path

#### Nice to Have Later
- polished home screen
- quote history filters
- logo upload
- resend actions

### Slice 1: Make It Feel Real

After the end-to-end path works:
- clean up the review/edit UX
- improve quote PDF template
- add quote history list
- add native sharing and fallbacks
- add basic settings

### Slice 2: Pilot Readiness

Before testing with real users:
- event logging
- better error states
- transcript visibility improvements
- speed improvements
- guardrails for null pricing and ambiguous fields

---

## 15. Immediate Build Plan (Start Today)

If the goal is to begin implementation immediately, build in this order:

### Today’s Target

**End the day with a working vertical path:**
- create customer
- submit rough input
- receive structured draft JSON
- edit line items
- render quote PDF

### Practical Order

1. Define the structured output schema for draft extraction
2. Build one FastAPI endpoint for typed rough notes -> structured JSON
3. Build one simple React review screen using mocked or live JSON
4. Build quote + line_items persistence
5. Generate a basic quote PDF
6. Add audio capture after the typed-notes path works
7. Replace mock data with live audio/transcript flow

### Why This Order

Typed notes let you validate the extraction and review loop before fighting browser audio issues.
Once the typed path works, audio becomes an input layer on top of a proven quote-draft system.

---

## 16. Open Questions to Answer During Build

1. Should quote totals be editable independently from line-item prices in v0?
2. Will users prefer starting from a customer list or a quote list?
3. How often will users want to revise transcript text directly vs. editing line items only?
4. Does the landscaping prompt need separate handling for materials vs. labor?
5. Is quote numbering needed in the first build, or can it be added after the flow works?

Recommended default answers for speed:
- yes, total can be editable
- start from quote list / new quote flow
- transcript visible, direct transcript editing optional
- keep prompt simple first
- ~~quote numbering can be basic and sequential~~ **RESOLVED: sequential per-user integer, Q-001 format, generated on POST /api/quotes**

---

## 17. Testing Strategy

Testing is a first-class concern in Stima because the core pipeline has more unknowns than any previous project. Voice transcription quality is environment-dependent, AI extraction can hallucinate, and PDF rendering has visual side effects that are hard to catch in code review. Tests exist here not for coverage metrics but to catch the specific failure modes that will actually hurt users.

### Where Tests Are Non-Negotiable

**AI extraction output parsing**
The extraction pipeline is the highest-risk component. Test it extensively with mocked Claude responses:
- null pricing is handled correctly (no zero-fill, no inventory)
- total-only input preserves total and sets all line item prices to null
- ambiguous input returns something rather than crashing
- malformed or partial JSON from Claude is caught and surfaced cleanly, not silently swallowed

**Audio upload and transcription path**
Mock Whisper responses to test:
- single clip upload succeeds
- multiple clips are normalized and stitched before transcription
- unsupported audio format triggers a clean error (not a 500)
- empty or zero-length clip is rejected before hitting Whisper

**Quote state transitions**
Test that status moves correctly: draft → ready → shared. Test that a quote cannot skip states in ways that would produce broken PDFs or share links.

**Auth and token handling**
Refresh token rotation, logout invalidation, and expired token rejection. These patterns are established from Quaero — port the test approach directly.

### Where Tests Are Helpful but Secondary

- Customer CRUD (low risk, standard patterns)
- PDF visual correctness (hard to assert, better handled by manual spot-check during dev)
- Event logging (fire-and-forget; assert the write, not the shape)

### Testing Approach for Audio Specifically

Because transcription quality in real field conditions (wind, traffic, phone microphone) is unknown, build a **transcript fixture library** alongside the tests: a set of raw transcript strings representing different quality levels (clean, partial, noisy, total-only, no prices at all). Run extraction tests against all of them. This will surface prompt weaknesses before a real user does.

---



## 18. Summary

Stima v0 should be built as a narrow, high-confidence vertical slice:

**Voice or notes -> AI draft -> review/edit -> professional quote -> native share**

That is the product to validate first.

Everything else is future scope.

If this slice works, the rest of the roadmap becomes much safer:
- invoices
- payment links
- receipts
- gallery
- exports
- monetization

If this slice does not work, the rest of the product does not matter.
