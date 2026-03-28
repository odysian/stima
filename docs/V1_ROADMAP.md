# Stima V1 Roadmap

**Version:** 1.0 — March 2026
**Status:** Active
**Assumes:** V0 is complete, deployed, and pilot-ready
**Reference:** `docs/PRODUCT.md` for strategic context

---

## Purpose

V1 closes the quoting loop. V0 proved that the extraction pipeline works and a contractor
can produce a professional quote fast. V1 makes that quote mean something — the customer
sees it on a branded page, responds to it, and the contractor knows the outcome and can
act on it.

By the end of V1, a contractor can run their full quoting-to-invoice workflow inside
Stima without leaving the app or copy-pasting links.

---

## V1 Goal

> A contractor sends a quote from Stima. The customer receives it by email, views a
> branded landing page, and approves or declines. The contractor sees the response,
> follows up if needed, and converts the approved quote to an invoice in one action.

---

## Scope Boundary

**V1 is:**
- The quote delivery and response loop
- Email delivery from Stima to the customer
- A customer-facing branded quote page
- Quote status that reflects real outcomes
- Lightweight invoice generation from an approved quote
- Logo and branding on PDFs
- Operational visibility (error monitoring, basic analytics)

**V1 is not:**
- Payment collection or processing
- Full invoice management or accounts receivable
- Line item templates or service catalogs (V2)
- Photo documentation or customer notes (V2)
- Subscription billing (V3)

---

## Public Endpoint Security Model

V1 introduces one unauthenticated endpoint: the public document landing page. It
requires explicit security design because it is externally reachable without a
contractor account.

### Token-as-credential model

The share token is the authorization mechanism for the public document page. Possession
of the link is proof of authorization — the same model used by DocuSign, HelloSign, and
every major quoting tool. Customers do not create accounts or enter PINs.

This model is secure when:
- V0 already persists a server-generated `share_token` on `documents`; today the token
  is created on first share, not pre-generated at `ready`
- The current V0 token format is `uuid4()` (~122 bits of entropy). If V1 upgrades to
  `secrets.token_hex(32)` (256 bits), existing tokens must be preserved or explicitly
  migrated.
- If V1 hardens the token format or generation timing, treat that as explicit migration
  work rather than an already-shipped V0 contract
- Transport is HTTPS only (tokens travel in URLs and must not be logged or leaked)
- Status transitions are one-way and enforced server-side

### GET /doc/:token (view landing page)

- No authentication required
- No write side effects beyond status transition (`shared → viewed`) and event log
- Returns 404 for unknown tokens — do not distinguish "wrong token" from "not found"
  (enumeration resistance)

### Event logging on public actions

Public landing page activity must be logged in event_logs:
- `quote_viewed` — on GET /doc/:token when doc_type = quote
- `invoice_viewed` — on GET /doc/:token when doc_type = invoice

Log the document_id. Do NOT log the share_token or customer IP in event_logs metadata.

---

## Quote Status Contract Change

This is the first migration V1 requires. The current status lifecycle is:

```
draft → ready → shared
```

V1 expands this to:

```
draft → ready → shared → viewed → approved | declined
```

All existing quotes with `shared` status are unaffected. New statuses only apply
to quotes sent through the V1 delivery flow. `approved` and `declined` are
contractor-set outcomes — recorded after the customer confirms or rejects the job
over the phone or in person.

`expired` status is deferred. Expiry is list hygiene only and does not unlock any
downstream milestone. It can be added once pilot data shows it is needed.

This schema change is a prerequisite for Milestones 1, 2, and 3 below.

---

## Admin Access Model

V1 does not introduce a contractor-facing admin role or a new `is_admin` user contract.

Any V1 admin/support routes are internal operator tooling only:

- not part of the normal contractor UI
- not authorized through standard contractor sessions alone
- protected by an explicit internal-only access mechanism such as environment-gated
  route enablement plus infra auth, IP allowlisting, or a server-side admin secret

If Stima later needs true in-product admin accounts, that should be scoped as a
separate authentication/authorization task rather than hidden inside Milestone 6.

---

## Milestones

### Milestone 0: Branding Foundation

**Goal:** Every PDF a contractor sends looks like it came from their business.

**Scope:**
- Logo upload on the Settings screen (image upload, stored in cloud storage)
- Logo rendered in the PDF header alongside business name
- If no logo is uploaded, the PDF header uses business name only (existing behavior)

**Acceptance criteria:**
- User can upload a logo image from Settings
- Uploaded logo appears on all newly generated PDFs
- Previously generated PDFs are unaffected
- Logo upload is optional — no gate on quote flow if skipped
- Supported formats: JPEG, PNG. Max size: 2MB.

**Storage design note:** The cloud storage integration introduced here must be built as
a general-purpose file storage utility, not a logo-specific one. V2 introduces photo
documentation — both logo and photo uploads need the same operations (upload, delete,
generate URL). The correct implementation is a `storage_service` that accepts a path
prefix and file bytes and returns a URL. M0 calls it with prefix `logos/{user_id}/`.
V2 calls it with `photos/{user_id}/{document_id}/`. One service, multiple consumers.

**Why first:** Every quote the contractor sends from this point forward carries their
brand. This is low-risk and high-visibility. It also unblocks the customer-facing
landing page (Milestone 2) which needs the same logo asset.

---

### Milestone 1: Quote Status Expansion

**Goal:** The quote status lifecycle reflects real-world outcomes, not just document state.

**Scope:**
- Database migration: add `viewed`, `approved`, `declined` to the status check constraint
- Backend: status transition logic and validation
- Backend: `POST /api/quotes/:id/mark-won` and `POST /api/quotes/:id/mark-lost`
  (authenticated contractor actions — no public endpoint)
- Database migration: add `source_document_id UUID NULL REFERENCES documents(id) ON
  DELETE SET NULL` to `documents` so quote→invoice linkage exists before later V1 work
- Frontend: updated status badges for new states
- Frontend: Mark as Won / Mark as Lost actions on the quote preview screen (visible
  only when status is `shared` or `viewed`)

**Acceptance criteria:**
- All three new statuses are valid and enforced at the DB level
- A quote can only move forward through the lifecycle, not backward
- Mark as Won transitions `shared`/`viewed` → `approved`; emits `quote_approved` event
- Mark as Lost transitions `shared`/`viewed` → `declined`; emits `quote_marked_lost`
  event (not `quote_declined` — that name is reserved for a future customer-facing action)
- Both actions return 409 if the quote is not yet shared or already has an outcome
- New status badges render correctly in quote list and detail views
- Existing `draft`, `ready`, `shared` behavior is unchanged

---

### Milestone 2: Public Quote Landing Page

**Goal:** Replace the direct PDF stream with a branded customer-facing page where the
customer can view the quote and take action.

**Schema notes:**
- `share_token` column already exists on `documents` from V0 (migration
  `20260320_0005_add_share_token_to_documents`). In the shipped V0 implementation, the
  token is created on first share and then reused. If V1 changes token format or
  generation timing, that should be explicit migration work rather than an assumed
  existing contract.

**Route:** `/doc/:token` (unauthenticated, token-gated)

Milestone 2 is quote-first. It introduces the public document route for quote pages.
Milestone 5 extends the same route shape to invoices once invoice documents exist.

The landing page is **read-only**. Customers view the quote and download the PDF.
Approve/decline decisions are recorded by the contractor (via Mark as Won / Mark as Lost
from Milestone 1) after the customer communicates their decision over the phone or in
person. Customer-facing action buttons are not part of V1 scope.

Resolution logic for Milestone 2 quote pages:

1. Look up document by `share_token` column (exact match)
2. Not found → 404 page ("This link is not valid")
3. Found and terminal (`approved` or `declined`) → closed state appropriate to status
4. Otherwise → render the quote document page for `doc_type = "quote"`

**Status transition on page load:**
- If status = `shared` → transition to `viewed`
- Log a `quote_viewed` event on page load

**Scope:**
- Page renders: contractor logo, business name, quote number, title (if present), date,
  line items, total, optional notes
- Page is mobile-first and readable without an account
- No customer action buttons — page is read-only
- Existing public PDF route (`/share/:token`) remains available; landing page includes
  a "Download PDF" link that points to that route

**Acceptance criteria:**
- Public page loads without authentication using the existing share token
- Page is readable on mobile (primary) and desktop
- Viewing the page records a `quote_viewed` event and transitions status to `viewed`
- If the quote is already `approved` or `declined`, the page shows an appropriate
  closed state
- No action buttons are rendered — the page is read-only for the customer

**Forward-compatibility note:** Milestone 5 reuses `/doc/:token` for invoice documents.
Invoice pages also render read-only.

---

### Milestone 3: Email Delivery

**Goal:** The contractor can send the quote link to the customer by email directly from
Stima — no copy-pasting.

**Scope:**
- "Send by Email" action on the quote preview/share screen
- Sends a transactional email to the customer's email address with:
  - contractor name and business name in the from/subject line
  - quote number and total in the email body
  - a clear link to the public landing page
  - the PDF attached or linked as a secondary option
- Email is only available if the customer record has an email address
- If no customer email exists, prompt to add one or fall back to copy-link
- Sent email transitions quote status to `shared` (if not already)
- Re-sharing a quote already at `viewed` or later does not regress the status
- Delivery provider: SendGrid (or equivalent transactional email service)

**Acceptance criteria:**
- Contractor can send email to customer from the quote preview screen
- Email renders correctly on mobile email clients
- Email includes quote number, total, contractor name, and the landing page link
- Missing customer email is handled gracefully with a prompt, not a broken state
- A `quote_shared` event is recorded on send
- Rate limiting or send guards prevent accidental duplicate sends

**Pre-work required before Milestone 3 build begins:**
- [ ] Sending domain confirmed (e.g., `noreply@stima.dev` or `mail.stima.dev`)
- [ ] SendGrid account created and API key generated
- [ ] SPF record added to domain DNS
- [ ] DKIM record added to domain DNS
- [ ] DMARC record added (prevents spoofing of the sending domain)
- [ ] Domain verification confirmed in SendGrid dashboard
- [ ] Test email sent and received successfully before writing any application code

Note: DNS propagation can take 24–48 hours. Start this before reaching Milestone 3 in
the build sequence, not on the day Milestone 3 begins.

---

### Milestone 4: Reminder Workflow

**Goal:** Contractors do not lose jobs because they forgot to follow up on an unanswered
quote.

**Scope:**
- Quotes in `shared` or `viewed` status for more than 3 days surface a reminder prompt
  in the quote detail view
- "Resend" action: re-sends the quote email with a short "just following up" wrapper
- Reminder prompt is informational, not a push notification (V2 can add push)

Note: The base "Mark as Lost" action (setting status to `declined`, emitting
`quote_marked_lost`) ships in Milestone 1. Milestone 4 adds the idle-detection
reminder banner that surfaces it contextually after 3 days of no activity.

**Acceptance criteria:**
- Quotes idle in `shared` or `viewed` for 3+ days show a reminder banner on detail view
- Resend sends the same email flow as Milestone 3 with a follow-up subject line
- Resend is rate-limited (maximum once per 24 hours per quote)
- Reminder banner disappears once the quote receives an outcome or is manually closed

---

### Milestone 5: Quote to Invoice Conversion

**Goal:** A contractor who wins a job can convert the approved quote to an invoice in one
action, without re-entering any line items.

**Scope:**
- "Convert to Invoice" action on approved quotes
- Creates a new document record with `doc_type: "invoice"` seeded from the quote's
  line items, total, and customer
- Invoice inherits the source quote title when present
- Invoice document gets its own sequential number in `I-001` format
- Invoice adds one new field: **Due Date** (required, date picker, defaults to 30 days
  out)
- Invoice PDF uses the same template as the quote PDF with "Invoice" in the header and
  the due date in the document metadata block
- Invoice can be sent by email using the same delivery flow as Milestone 3; the
  customer-facing page is served at `/doc/:token` and renders read-only (no action
  buttons — invoices are not two-way)
- Invoice status lifecycle: `draft → ready → sent` (no approve/decline)
- Invoices appear in the quote list alongside quotes, differentiated by doc type badge

**Schema note:** `source_document_id` should already exist from the Milestone 1 schema
expansion. Milestone 5 populates it at conversion time and never updates it after.
The quote detail screen queries `SELECT * FROM documents WHERE source_document_id =
:quote_id` to find and surface the resulting invoice.

**Acceptance criteria:**
- "Convert to Invoice" is available on quotes with `approved` status
- Invoice is pre-populated with all line items and total from the source quote
- Invoice number is sequential per user in `I-001` format
- Due date is required before the invoice can be sent
- Invoice PDF renders correctly with "Invoice" header and due date
- Invoice inherits the source quote title when present
- Invoice can be emailed directly to the customer via `/doc/:token` landing page
- The source quote and the invoice are linked via `source_document_id`; quote detail
  shows the resulting invoice
- Converting a quote to an invoice does not change the quote's status or data

---

### Milestone 6: Operational Visibility

**Goal:** Have enough instrumentation and error monitoring in place before real users
depend on the app.

**Scope:**
- Error monitoring integration (Sentry or equivalent) on both backend and frontend
- Basic admin analytics route: `GET /api/admin/events` returning aggregated counts
  of pilot event names over a time window (internal-only operator route; see Admin
  Access Model above)
- Extend event logging with new V1 events:
  - `quote_viewed`
  - `invoice_viewed`
  - `quote_approved` (contractor marks Won — ships in M1)
  - `quote_marked_lost` (contractor marks Lost — ships in M1)
  - `invoice_created`
  - `email_sent`

Note: `quote_declined` is reserved for a potential future customer-facing decline
action and is not part of V1. `quote_changes_requested` and `quote_expired` have
been removed from V1 scope.
- Structured error logging on the extraction pipeline (already partially in place)

**Acceptance criteria:**
- Unhandled exceptions in backend and frontend are captured in error monitoring
- Admin route returns event counts by name and day for a given date range
- All new V1 user actions are logged as events
- No PII (customer names, emails) stored in event metadata

---

## Pre-V1 Polish

Small, focused improvements to existing screens that should land before the V1 milestones
begin. These are not new features — they fix UX problems that will compound as V1 adds
more on top of them. New items can be added here as they surface during pilot use.

### Customer detail: condensed read view

The current customer detail screen shows an always-open form that consumes most of the
screen. Replace with a condensed read view: customer name prominent, address/phone/email
as a small metadata block below it, and a single edit button that opens the form. This
frees up the screen for the jobs list and the three-tab layout planned for V2.

**Acceptance criteria:**
- Customer info displays as read-only text by default
- Edit button opens an inline or separate edit form
- No loss of existing edit functionality
- Screen feels less form-heavy on first open

### Quote title field

An optional short title on quotes and invoices (e.g., "Spring Cleanup", "Back patio
rebuild") so contractors can scan a list of jobs by name rather than by number alone.

**Schema:** Add a nullable `title` column to `documents`. No migration to existing quotes
required — blank is fine.

**Display:**
- Quote list: show title as the primary label when present, doc number as secondary
  metadata alongside date and item count
- Quote detail: show title below the doc number
- Customer detail jobs tab (V2): title makes the job history readable at a glance

**Feeds into V1 milestones:**
- Customer-facing landing page (Milestone 2) uses title as the page heading when present
- Email subject line (Milestone 3) uses title: "Quote for Spring Cleanup" instead of
  "Quote Q-012"
- Invoice conversion (Milestone 5) inherits the title from the source quote

**Acceptance criteria:**
- Title field is optional on the quote review/edit screen
- Quotes without a title display and function exactly as before
- Title appears in the quote list, quote detail, and is passed through to PDF and email

---

## Suggested Build Order

1. Pre-V1 Polish — Customer detail layout + quote title field (cleans up the base before
   building on top of it)
2. Milestone 0 — Branding (low risk, high visibility, unblocks landing page)
3. Milestone 1 — Status expansion (schema foundation everything else depends on)
4. Milestone 6 — Operational visibility (Sentry setup must ship before any public URL
   exists — the first public-facing endpoint is M2, so monitoring comes first)
5. Milestone 2 — Public landing page (the core V1 experience)
6. Milestone 3 — Email delivery (makes the landing page reachable without copy-paste)
7. Milestone 4 — Reminder workflow (builds on delivery + status)
8. Milestone 5 — Invoice conversion (completes the quoting-to-invoice loop)

---

## New Infrastructure Dependencies

| Dependency | Milestone | Notes |
|---|---|---|
| Cloud file storage (S3/GCS) | 0 | Logo upload requires persistent file storage |
| Transactional email provider (SendGrid) | 3 | New service, requires API key + domain setup |
| Error monitoring (Sentry) | 6 | New service, requires project setup on both frontend and backend |

These three infrastructure items should be provisioned before or during their respective
milestone, not after. They are not complex to set up but they are external dependencies
that can block progress if left too late.

---

## Contracts Locked After V1

Once V1 is complete, the following should be treated as stable:

- Quote status lifecycle: `draft → ready → shared → viewed → approved | declined`
- Invoice status lifecycle: `draft → ready → sent`
- Public document route: `/doc/:token` (handles both quotes and invoices, branches on `doc_type`; read-only for customers)
- Contractor outcome endpoints: `POST /api/quotes/:id/mark-won` and `POST /api/quotes/:id/mark-lost`
- Invoice doc type and `I-001` numbering format
- `source_document_id` on `documents` as the quote→invoice link
- Canonical event log names for all V1 user actions

---

## V1 Success Criteria

V1 is considered successful if, after a pilot period:

- At least 50% of shared quotes are sent via email (not just copy-link)
- At least 30% of shared quotes are marked Won or Lost by the contractor
- At least one invoice is generated from an approved quote per active pilot user
- Error monitoring captures actionable errors before users report them
- No quote or invoice data is lost or corrupted through status transitions
