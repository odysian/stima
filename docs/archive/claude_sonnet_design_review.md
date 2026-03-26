# Stima — Design Review: Agent Update Brief

**Date:** March 2026
**Status:** Action Required — Update planning docs before V1 build begins
**Scope:** `docs/PRODUCT.md`, `docs/V1_ROADMAP.md`, `docs/V2_ROADMAP.md`
**Reference:** Based on architecture review of V0 vertical slice spec, V1 and V2 roadmaps,
and product strategy doc.

---

## How to Use This Document

This brief identifies gaps, missing decisions, and security requirements that must be
reflected in the planning docs before V1 implementation begins. For each item:

- **What to update** — which doc and section
- **What to add** — the concrete language or schema to insert
- **Why it matters** — the rework or failure mode it prevents

Work through items in the order they appear. Items marked **BLOCKING** must be resolved
before the milestone they gate can begin. Items marked **PRE-WORK** should be added to
the planning docs now even if the work happens later.

---

## Part 1: Schema Gaps — Add Before Any V1 Build Starts

These are missing columns or tables that will cause mid-build migrations if not decided
now. They affect the V1 ROADMAP milestone specs and the V0 vertical slice spec
(as forward-compatibility notes).

---

### 1.1 — `source_document_id` on the `documents` table

**What to update:** `docs/V1_ROADMAP.md` — Milestone 5 (Quote to Invoice Conversion)

**What to add:**

Add an explicit schema note to Milestone 5 that the following column must exist on
`documents` before the invoice conversion endpoint is built:

```
documents
└── source_document_id   UUID, NULL, FK → documents.id, ON DELETE SET NULL
```

This column stores the quote ID that an invoice was generated from. It is NULL for
all quotes, and NULL for invoices created manually. It is set at conversion time and
never updated after that.

The quote detail screen uses this relationship in reverse — query
`SELECT * FROM documents WHERE source_document_id = :quote_id` to find the resulting
invoice and surface it in the quote detail view.

**Migration note:** This column should be added in the Pre-V1 Polish migration, not
at Milestone 5. Adding it early costs nothing; retrofitting it mid-Milestone 5 under
build pressure is avoidable.

**Why it matters:** Without this column, the requirement "quote detail shows the
resulting invoice" has nowhere to write. It also enables future features — revision
history, audit trail, multi-invoice jobs — without a second migration.

---

### 1.2 — `share_token` persistence on the `documents` table

**What to update:** `docs/V1_ROADMAP.md` — Milestone 2 (Public Landing Page),
and `docs/Stima_V0_Vertical_Slice_Spec.md` as a forward-compatibility note.

**What to add:**

Confirm and document that the `documents` table includes the following column. If it
does not exist in the current V0 schema, add it in the Pre-V1 Polish migration:

```
documents
└── share_token   VARCHAR(64), NULL, UNIQUE
```

**Token generation rules:**
- Generated using `secrets.token_hex(32)` (Python stdlib) — produces a 64-character
  hex string with 256 bits of entropy.
- Generated at the moment the quote transitions to `ready` status (not at PDF generation
  time, not at share time). This ensures the token exists before the contractor ever
  taps share or send.
- Stored in plaintext in this column. It is not sensitive enough to require hashing
  (it is a share link, not an auth credential), but it must be unique and indexed.
- Never regenerated after creation. If a contractor re-shares a quote, they share
  the same token. Regeneration would invalidate any links already delivered to customers.

**Why it matters:** The `/doc/:token` landing page resolves the document by this column.
If the token is currently computed on-the-fly from a JWT signature, the status transition
on page view (`shared → viewed`) cannot be persisted back to the document because there
is no stable token-to-document mapping. The column must exist before Milestone 2 begins.

---

### 1.3 — `customer_response_note` on the `documents` table

**What to update:** `docs/V1_ROADMAP.md` — Milestone 2 (Public Landing Page)

**What to add:**

Add the following column to `documents` to store customer "Request Changes" notes:

```
documents
└── customer_response_note   TEXT, NULL
```

Set when the customer submits a "Request Changes" action via the respond endpoint.
Displayed in the contractor's quote detail view below the status badge when present.
Never customer-facing. Never shown on the landing page.

**Why it matters:** The Milestone 2 acceptance criteria state "Customer response note is
stored and visible to the contractor in quote detail." There is currently no column for
this. It is a one-liner migration but it needs to be in the spec so the agent does not
invent a solution (e.g., stuffing it into a JSONB metadata blob).

---

## Part 2: Architecture Decisions — Lock Before Building

These are design choices that affect multiple milestones. Building without locking them
produces either inconsistent behavior or a forced rewrite at a later milestone.

---

### 2.1 — Public Document Landing Page: Single Route `/doc/:token`

**Decision locked:** Use a single route `/doc/:token` for both quotes and invoices.

**What to update:** `docs/V1_ROADMAP.md` — Milestone 2, and the Scope Boundary section
at the top of the doc. Also update any reference in Milestone 5 that says "same delivery
flow" to be explicit about what that means.

**What to add to Milestone 2:**

Replace any language that says `/q/:token` with `/doc/:token` throughout V1_ROADMAP.md.

Add the following to the Milestone 2 spec:

```
Route: /doc/:token (unauthenticated, token-gated)

Resolution logic:
  1. Look up document by share_token column (exact match)
  2. If not found → 404 page ("This link is not valid")
  3. If found but expired → show closed state ("This quote has expired")
  4. If found and terminal (approved/declined) → show closed state appropriate to status
  5. Otherwise → render the document page, branching on doc_type

Render branch:
  doc_type = "quote"  → Show line items, total, notes. Action buttons: Approve /
                         Decline / Request Changes.
  doc_type = "invoice" → Show line items, total, due date. No action buttons.
                          Read-only. Show contractor contact info if present.

Status transition on page load (GET):
  - If doc_type = "quote" and status = "shared" → transition to "viewed"
  - All other doc_types and statuses → no transition on load
  - Log a quote_viewed or invoice_viewed event in event_logs regardless

PDF fallback:
  The existing /api/quotes/:id/pdf/:token route remains available.
  The landing page includes a "Download PDF" link that calls this route.
```

**Why this matters:** Milestone 5 says invoices use "the same delivery flow as
Milestone 3." Without a defined invoice landing page, the agent building Milestone 5
will either skip the page entirely or improvise a second route. The `/doc/:token`
contract needs to be in the spec so it is treated as a first-class requirement, not
an afterthought.

---

### 2.2 — Contracts Locked After V1 (add to V1_ROADMAP.md)

**What to update:** `docs/V1_ROADMAP.md` — "Contracts Locked After V1" section

**What to add:** The following items are already in the doc but need the `/doc/:token`
update. Replace `/q/:token` with `/doc/:token` in the locked contracts list. Final
locked contracts list should read:

```
- Quote status lifecycle: draft → ready → shared → viewed → approved | declined | expired
- Invoice status lifecycle: draft → ready → sent
- Public document route: /doc/:token (handles both quotes and invoices, branches on doc_type)
- Customer response endpoint: POST /api/quotes/:id/respond
- Invoice doc type and I-001 numbering format
- Canonical event log names for all V1 user actions
```

---

## Part 3: Security Model — Add as a Standalone Section

The respond endpoint is the only unauthenticated write endpoint in the application.
It currently has no explicit security spec in V1_ROADMAP.md. Add the following as a
new section to that doc before the Milestones list.

---

### 3.1 — Add "Public Endpoint Security Model" section to V1_ROADMAP.md

**What to update:** `docs/V1_ROADMAP.md` — add a new top-level section after
"Scope Boundary" and before "Quote Status Contract Change"

**Section to add:**

```markdown
## Public Endpoint Security Model

V1 introduces two unauthenticated endpoints. Both require explicit security design
because they are externally reachable without a contractor account.

### Token-as-credential model

The share token IS the authorization mechanism for the public document page and the
customer respond endpoint. Possession of the link is proof of authorization — the same
model used by DocuSign, HelloSign, and every major quoting tool. Customers do not create
accounts or enter PINs.

This model is secure when:
- Tokens are cryptographically random and non-guessable (see 1.2 above)
- Transport is HTTPS only (tokens travel in URLs and must not be logged or leaked)
- Status transitions are one-way and enforced server-side
- The token is validated on every write action, not just on page load

### GET /doc/:token (view landing page)

- No authentication required
- No write side effects beyond status transition (shared → viewed) and event log
- Safe to cache at CDN edge with short TTL (60s max) — status changes within that
  window are acceptable
- Returns 404 for unknown tokens (do not distinguish "wrong token" from "not found" —
  enumeration resistance)

### POST /api/quotes/:id/respond (customer action)

This is a public write endpoint. It must enforce the following before accepting any
action:

**Token validation:**
- `share_token` must be included in the request body (not a query parameter — query
  params appear in server logs and referrer headers)
- Perform a timing-safe string comparison between the submitted token and the stored
  `share_token` column value
- If tokens do not match → 403, no further processing

**Status guard:**
- Load the document and check current status before applying any transition
- If status is already in a terminal state (approved, declined, expired) → 409
  with a clear message ("This quote has already been responded to")
- Status transitions are one-way: the service layer must enforce this regardless of
  what the frontend sends

**Idempotency:**
- If the same action is submitted twice (e.g., customer double-taps Approve) and the
  status is already the target state → return 200 silently, do not error
- If the status is a *different* terminal state → return 409

**Rate limiting:**
- 10 requests per minute per IP on this endpoint
- Applies to both valid and invalid token submissions
- Returns 429 on breach

**Input validation:**
- `action` field: enum validation — only `approved`, `declined`, `request_changes`
  are accepted values. Reject anything else with 422.
- `note` field (for request_changes): max 1000 characters, strip leading/trailing
  whitespace, sanitize for XSS before storage

**No PII in error responses:**
- Error messages must not reveal whether a document ID exists, who the contractor is,
  or any details about the document
- On token mismatch: generic "Link is not valid" message only

### Event logging on public actions

All public endpoint activity must be logged in event_logs:
- `quote_viewed` — on GET /doc/:token when doc_type = quote
- `invoice_viewed` — on GET /doc/:token when doc_type = invoice
- `quote_approved` — on POST respond with action = approved
- `quote_declined` — on POST respond with action = declined
- `quote_changes_requested` — on POST respond with action = request_changes

Log the document_id and action. Do NOT log the share_token, customer IP, or any
customer-provided note content in event_logs metadata.
```

---

## Part 4: Infrastructure — Add Pre-Work Items

These are not code tasks but they block specific milestones. They need to be added to
the V1 ROADMAP so they appear in the build timeline and are not discovered on the day
they are needed.

---

### 4.1 — Move Operational Visibility (M6) earlier in the build order

**What to update:** `docs/V1_ROADMAP.md` — "Suggested Build Order" section

**Current order:**
```
1. Pre-V1 Polish
2. M0 — Branding
3. M1 — Status expansion
4. M2 — Public landing page
5. M3 — Email delivery
6. M6 — Operational visibility (parallel with 4-6)
7. M4 — Reminder workflow
8. M5 — Invoice conversion
```

**Updated order:**
```
1. Pre-V1 Polish
2. M0 — Branding
3. M1 — Status expansion
4. M6 — Operational visibility (Sentry setup — ship before any public-facing URLs exist)
5. M2 — Public landing page
6. M3 — Email delivery
7. M4 — Reminder workflow
8. M5 — Invoice conversion
```

**Rationale to add to the doc:** Sentry must be in place before real users can reach
the application. The first moment a real user can reach Stima is when M2 ships a public
URL. An unmonitored 500 on the landing page or the respond endpoint has no visibility
without error monitoring. M6 is cheap to set up and should not be deferred past M1.

---

### 4.2 — Add pre-work checklist for SendGrid to M3

**What to update:** `docs/V1_ROADMAP.md` — Milestone 3 (Email Delivery)

**What to add** as a "Pre-work required before building" block at the top of the
Milestone 3 spec:

```
Pre-work (must be complete before Milestone 3 build begins):
- [ ] Sending domain confirmed (e.g., mail.stima.dev or noreply@stima.dev)
- [ ] SendGrid account created and API key generated
- [ ] SPF record added to domain DNS
- [ ] DKIM record added to domain DNS
- [ ] DMARC record added (recommended — prevents spoofing of the sending domain)
- [ ] Domain verification confirmed in SendGrid dashboard
- [ ] Test email sent and received successfully before writing any application code

Note: DNS propagation can take 24-48 hours. Start this before reaching M3 in the
build sequence, not on the day M3 begins.
```

---

## Part 5: V2 Forward-Compatibility Notes

These do not require V2 to be built now. They require small decisions in V1 that keep
V2 from being a rewrite. Add these as forward-compatibility notes to the relevant
V1 specs and as clarifying language in V2_ROADMAP.md.

---

### 5.1 — Extraction service must accept optional customer context

**What to update:** `docs/V2_ROADMAP.md` — Track 2, "Job history in extraction context"

**What to add:**

Add a note that the V1 extraction service must be built with the following contract
so that V2 context injection is an additive change, not a rewrite:

```
V1 extraction service contract (build this way in V1, extend in V2):

  extract_quote_draft(
    transcript: str,
    customer_context: CustomerContext | None = None   ← add this param in V1, pass None always
  ) -> QuoteDraft

Where CustomerContext will eventually contain:
  - customer_id: UUID
  - prior_line_item_descriptions: list[str]   ← populated from prior quotes in V2

Building the service with this optional parameter from the start means V2 adds
context injection by populating the parameter — not by changing the function signature
or touching call sites.
```

**Why it matters:** If V1 builds `extract_quote_draft(transcript: str)` as a closed
function with no context parameter, V2 must modify every call site when it adds customer
context. Building the seam in V1 costs nothing and saves a risky refactor.

---

### 5.2 — Logo storage must be designed as a general file storage pattern

**What to update:** `docs/V1_ROADMAP.md` — Milestone 0 (Branding), infrastructure notes

**What to add:**

Add a note that the cloud storage integration introduced in M0 for logo upload must be
built as a general-purpose file storage utility, not a logo-specific one. V2 introduces
`document_photos` and `gallery_photos` — both require the same cloud storage operations
(upload, delete, generate URL). If M0 builds a `logo_service.py` with hardcoded paths
and bucket logic, V2 will duplicate it.

The correct V1 implementation is a `storage_service.py` (or equivalent) that accepts
a path prefix and file bytes and returns a public URL. M0 calls it with prefix
`logos/{user_id}/`. V2 calls it with `photos/{user_id}/{document_id}/`. One service,
multiple consumers.

---

### 5.3 — PDF template must be built for conditional total-section rendering

**What to update:** `docs/V2_ROADMAP.md` — Track 1, "Taxes, discounts, and deposits"

**What to add:**

Add a note that when V1 builds the PDF template for quotes and invoices, the total
section must be implemented as a conditional block, not a hardcoded single-line total.
V2 adds tax, discount, and deposit lines to this section.

The Jinja2 template should structure the total block as:

```jinja2
{% if quote.deposit %}
<tr class="deposit-line">...</tr>
{% endif %}
{% if quote.discount %}
<tr class="discount-line">...</tr>
{% endif %}
{% if quote.tax_rate %}
<tr class="tax-line">...</tr>
{% endif %}
<tr class="total-line">...</tr>
```

Building the template this way in V1 means V2 only needs to add the columns and
populate the template variables — not restructure the template layout.

---

## Summary Checklist for Agent

The following is an ordered list of all doc changes required. Complete in this order:

**V1_ROADMAP.md:**
- [ ] Add "Public Endpoint Security Model" section (Part 3.1) after Scope Boundary
- [ ] Replace all `/q/:token` references with `/doc/:token`
- [ ] Update "Contracts Locked After V1" with `/doc/:token` entry (Part 2.2)
- [ ] Add `source_document_id` migration note to Milestone 5 (Part 1.1)
- [ ] Add `share_token` persistence note to Milestone 2 (Part 1.2)
- [ ] Add `customer_response_note` column note to Milestone 2 (Part 1.3)
- [ ] Add full landing page resolution logic and render branch to Milestone 2 (Part 2.1)
- [ ] Update Milestone 5 to explicitly reference `/doc/:token` for invoice delivery
- [ ] Update Suggested Build Order to move M6 before M2 (Part 4.1)
- [ ] Add SendGrid pre-work checklist to Milestone 3 (Part 4.2)
- [ ] Add logo storage design note to Milestone 0 (Part 5.2)

**V2_ROADMAP.md:**
- [ ] Add extraction service contract note to Track 2 context-aware extraction (Part 5.1)
- [ ] Add PDF template conditional rendering note to Track 1 taxes/discounts (Part 5.3)

**PRODUCT.md:**
- [ ] No changes required — strategy and phasing are sound as written

---

*This document should be archived in `docs/` after agent updates are complete.*
