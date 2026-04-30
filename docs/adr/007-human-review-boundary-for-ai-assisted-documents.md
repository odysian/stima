# ADR-007: Human Review Boundary for AI-Assisted Customer Documents

**Date:** 2026-04-29
**Status:** Accepted
**Spec/Task:** P1 Production Security & LLM Safety Gate / Pilot Readiness

---

## Context

Stima uses AI to turn messy typed/voice field notes into quote data. That gives the product its speed advantage, but it also creates a trust problem: AI-generated output may be incomplete, misheard, ambiguous, incorrectly priced, or influenced by adversarial/freeform user input.

The product must be able to say clearly:

> AI drafts; the contractor approves.

The current codebase reflects that boundary:

- Extraction produces structured draft data, not a sent quote.
- Unified extraction persists a draft quote but does not share, email, approve, decline, mark won/lost, or convert it.
- Public/customer-facing actions are separate explicit endpoints:
  - share/revoke;
  - generate/open PDF;
  - send email;
  - mark won/lost;
  - convert to invoice.
- Frontend delivery actions are explicit buttons and, for email/outcome/revoke/delete, confirmation dialogs.
- Public quote responses expose a limited customer-facing contract, not private authenticated quote detail.
- Extraction schemas validate and normalize model output before persistence.
- Review metadata and flags surface uncertainty without automatically deciding for the user.
- Production config and logging defaults are moving toward privacy-safe behavior; extraction raw content logging is gated behind `EXTRACTION_TRACE_INCLUDE_RAW_CONTENT`, default false.

This ADR documents the product and safety boundary so future AI features do not weaken it.

## Options Considered

### Option A: AI extraction can immediately send/share if confidence is high

Allow the model/provider or backend to auto-share/email a quote when extraction confidence appears good.

**Pros:**

- fastest possible workflow;
- impressive automation demo;
- fewer taps for simple jobs.

**Cons:**

- dangerous if extraction mishears prices, quantities, scope, customer notes, or totals;
- makes prompt injection and model hallucination higher impact;
- damages user trust if a bad quote reaches a customer;
- creates liability and product confusion;
- incompatible with the current positioning that Stima is a drafting assistant, not an autonomous agent.

### Option B: AI can mutate existing customer-facing documents after sharing

Allow later extraction/corrections to update shared/viewed documents automatically.

**Pros:**

- could support "add this extra item" workflows quickly;
- reduces manual editing for incremental changes.

**Cons:**

- customer-visible documents could change unexpectedly;
- requires audit/history/versioning to be safe;
- high risk around corrections/removals/replacements;
- current append extraction endpoint is removed, indicating this is not the active model.

### Option C: AI drafts only; user explicitly reviews and performs customer-facing actions (chosen)

AI can create or update draft/internal review state, but every customer-facing transition requires explicit user action through app controls and backend endpoints.

**Pros:**

- preserves user trust and control;
- limits prompt-injection blast radius;
- makes "AI-assisted" honest and explainable;
- aligns with solo tradesperson workflow: the contractor owns the quote;
- keeps public/share/email endpoints easier to reason about and test.

**Cons:**

- more taps than full automation;
- user must review/edit generated content;
- future automation features require careful product decisions and explicit ADR updates.

## Decision

Choose **Option C: AI drafts only; user approval is required before customer-facing delivery or outcome transitions**.

Rules:

1. AI extraction may produce structured draft content and review metadata.
2. AI extraction may create a persisted draft quote through the unified extraction boundary.
3. AI extraction must not automatically:
   - share a quote;
   - email a quote;
   - generate/send customer-facing delivery;
   - mark a quote won/lost;
   - approve/decline on behalf of a customer;
   - convert a quote to an invoice;
   - revoke or regenerate public share links;
   - mutate already shared customer-facing documents without explicit user action.
4. User/customer-provided text, transcripts, and support messages are untrusted input.
5. AI output must be schema-validated and business-rule validated before persistence.
6. Missing prices remain nullable; do not invent price values.
7. Ambiguity should surface as flags, unresolved details, degraded state, or review metadata rather than hidden automatic correction.
8. Public/share APIs must expose only intentional customer-facing fields.
9. Logs/telemetry should not store raw notes/audio/transcripts/prompts/provider responses by default.

## Consequences

**Product positioning:**

- Stima is a quote drafting assistant, not an autonomous quoting agent.
- The user can confidently explain that nothing is sent to customers without review.
- Interview framing is stronger: the AI feature is bounded by product trust and workflow design.

**Frontend behavior:**

- Review/edit remains central after extraction.
- Send/share/copy/revoke/outcome actions remain explicit controls.
- Confirmation dialogs are appropriate for destructive or customer-facing transitions.
- UI should avoid language implying the AI "finished" the quote without user approval.

**Backend behavior:**

- Extraction endpoints must remain separate from share/email/outcome/conversion endpoints.
- Mutating customer-facing endpoints should require authenticated user + CSRF.
- Public share should remain token-gated, revocable/expirable, noindex, and limited to intended fields.
- Quote status transitions should remain explicit domain methods, not side effects of extraction.

**LLM safety:**

- Prompt injection in notes should be treated as untrusted job content, not instructions to the system.
- Provider output must pass schema validation and backend business rules.
- Malformed/adversarial output should fail safely or degrade into reviewable draft state.
- Raw prompts/responses/transcripts should not enter normal logs or telemetry.

**Testing/review implications:**

- Add/maintain tests ensuring extraction cannot trigger customer-facing side effects.
- Add prompt-injection/adversarial extraction smoke tests where practical.
- Review any future AI feature against this ADR before implementation.

**Revisit triggers:**

- If Stima adds AI clarification before draft creation, update this ADR only if clarification can mutate server/customer state.
- If Stima adds auto-suggested quote options, preserve review before send.
- If Stima adds customer-selectable options or approval flows, document the customer action boundary separately.
- If Stima ever considers auto-send/auto-share, require a new ADR, risk review, audit trail, and explicit product decision.

## Evidence Reviewed

- `backend/app/features/quotes/api.py`
- `backend/app/features/quotes/schemas.py`
- `backend/app/features/quotes/creation/service.py`
- `backend/app/features/quotes/share/service.py`
- `backend/app/integrations/extraction.py`
- `backend/app/shared/extraction_logger.py`
- `backend/app/core/config.py`
- `frontend/src/features/quotes/components/QuotePreviewActions.tsx`
- `frontend/src/features/quotes/components/QuotePreviewDialogs.tsx`
- `frontend/src/features/quotes/hooks/useQuoteDocumentActions.ts`
- `docs/ARCHITECTURE.md`
- `docs/roadmaps/P1_PILOT_READY_PRODUCT_GTM.md`
- `docs/qa/P0_FIELD_RESILIENT_CAPTURE_QA.md`
