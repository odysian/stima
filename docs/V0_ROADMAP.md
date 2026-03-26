# Stima V0 Roadmap

**Version:** 1.1 — March 2026
**Status:** Finalized
**Tracks against:** `docs/archive/Stima_V0_Vertical_Slice_Spec.md` (sections 14-15) and `docs/archive/Stima_Project_Setup_v1.1.md`

---

## Purpose

This document is now the completion record for V0.

V0 is no longer a sequencing-only plan. It documents what shipped, what contracts were
locked, what infrastructure is live, and what remains intentionally deferred to V1.

---

## V0 Outcome

Stima V0 is feature-complete for its pilot scope:

- a user can register, log in, complete onboarding, and manage their business profile
- a user can create customers and draft quotes from typed notes or recorded audio
- a user can review extracted transcript data, correct it, edit line items, and generate a quote
- a user can generate a PDF, preview the quote state on mobile, and share a public PDF link
- a user can browse prior quotes, revisit customers, and update settings
- pilot instrumentation, timezone-aware quote dates, and key loading/error hardening are in place

This is the end of V0.

---

## Production Status

The deployed V0 stack is green:

- Frontend: Vercel at `https://stima.odysian.dev`
- Backend API: GCP VM + NGINX at `https://api.stima.odysian.dev`
- Database: Cloud SQL PostgreSQL
- Container registry: GHCR
- Deploy path: GitHub Actions -> GHCR image -> GCP deploy script

The deployment topology follows the March 24 deployment plan, with the originally
planned "future" Vercel frontend now live as part of the deployed V0 stack.

---

## Delivered Scope

### Foundation

- Full cookie-based auth backend: register, login, logout, refresh rotation, `/me`,
  CSRF double-submit, rate limiting, argon2id password hashing
- Full auth frontend: `LoginForm`, `RegisterForm`, `useAuth`, transport refresh handling,
  route protection, onboarding gating
- Onboarding and profile management using:
  - `business_name`
  - `first_name`
  - `last_name`
  - `trade_type`
  - `timezone`
  - `is_onboarded`

### Customers

- Auth-scoped customer CRUD
- Customer select flow for quote creation
- Customer list and customer detail/history screens

### Quote Creation

- Note-to-draft extraction via `POST /api/quotes/convert-notes`
- Audio capture pipeline via `POST /api/quotes/capture-audio`
- Six-fixture transcript library and extraction contract coverage
- Review screen with:
  - editable line items
  - editable totals
  - transcript visibility
  - transcript correction + regenerate flow
  - null-price review guardrails

### Quote Lifecycle

- Quote creation, detail, list, update, and deletion
- Per-user sequential quote numbers in `Q-001` format
- Quote PDF generation via WeasyPrint/Jinja2
- Public share token flow for streamed PDF access
- Mobile-first quote preview with state-based actions for generate/open/share

### Pilot Readiness

- Staged long-running loading feedback for extraction flows
- Inline error handling across capture, review, preview, and share flows
- Timezone-accurate quote dates for rendered documents and list/detail surfaces
- Pilot `event_logs` persistence with canonical underscore event names:
  - `quote_started`
  - `audio_uploaded`
  - `draft_generated`
  - `draft_generation_failed`
  - `quote_pdf_generated`
  - `quote_shared`

### Validation and Tooling

- Canonical local verification targets:
  - `make backend-verify`
  - `make frontend-verify`
  - `make verify`
  - `make extraction-live`
- Live extraction validation is isolated from default verification runs
- Backend/frontend verification passes locally at the time of this roadmap finalization

---

## Historical Delivery Order

V0 shipped in this broad order:

1. Task 1 - Onboarding + profile
2. Task 2 - Customer select/create
3. Task 3A - Backend extraction + quote CRUD
4. Task 3B - Frontend capture + review
5. Task 4 - PDF generation + preview + share
6. Task 4.5 - Extraction live validation
7. Task 5 - Voice capture
8. Task 6 - Quote list / home screen
9. Task 7 - Settings screen
10. Slice 2 - Error states + loading feedback
11. Slice 2 - Transcript correction + review guardrails
12. Slice 2 - Timezone-accurate quote dates
13. Slice 2 - Mobile-first quote preview PDF actions
14. Slice 2 - Pilot event logging
15. Follow-up - Canonicalize quote-flow event names

The quote-list UI polish work also landed during V0 as a frontend quality pass across
quote and customer list surfaces.

---

## V0 Contracts Locked

The following contracts should be treated as stable V0 behavior:

- Auth remains cookie-based with CSRF double-submit protection
- All customer and quote data is scoped to the authenticated user
- Quote status lifecycle is:
  - `draft`
  - `ready`
  - `shared`
- Quote numbering is sequential per user using `Q-001` formatting
- Quote list payload is intentionally lightweight and distinct from quote detail payload
- Public share links stream the quote PDF directly via `GET /share/{share_token}`; there
  is no branded public landing page in V0
- Pilot analytics uses canonical underscore event names; dot-notation events remain operational logs
- Quote dates are rendered in the saved business timezone when available

---

## Explicitly Deferred To V1

The following remain intentionally out of scope for V0:

- invoices, receipts, and payment collection
- email/SMS delivery workflows
- cloud file storage for PDFs or attachments
- async job queues or realtime extraction progress
- team accounts and role-based access
- branding uploads and white-label customization
- photo galleries and job attachments
- CSV export and accounting integrations
- app store packaging
- subscription billing
- full offline support

---

## Finalization Notes

Important implementation note:

- The early V0 planning language referenced an `owner_name` field.
- The shipped app standardized instead on `first_name` + `last_name`, and that is the
  canonical V0 profile contract going forward.

V0 should now be treated as complete and documented, not as an open planning track.
