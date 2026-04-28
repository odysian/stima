# Telemetry Event Vocabulary Audit — Task #597

**Scope:** P1 Spec 1 PR 1 — Audit/decision-only. No new telemetry infrastructure, client analytics, dashboards, or Sentry alerting.

**Date:** 2026-04-28

## 1. Summary of Findings

- **20 distinct backend event names** are emitted via `log_event(...)` across 15 Python modules.
- Only **12 events** are in the `_PILOT_EVENT_NAMES` allowlist; of those, **11 are actually persisted** under normal conditions and **1 is intentionally skipped** (`email_sent` uses `persist_async=False`).
- **8 events** are stdout-only because they are outside the allowlist.
- **No frontend telemetry** exists; there are zero `log_event`, analytics, or telemetry calls in the frontend codebase.
- A **confirmed sensitive payload risk** exists in `backend/app/integrations/extraction.py` where `log_extraction_trace` passes `raw_transcript` and `raw_tool_payload` into the logger. These fields are currently stripped by a global `_INCLUDE_RAW_CONTENT = False` toggle, but the surface remains exposed.
- The **existing backend events are sufficient for core P1 pilot visibility** (quote intake → draft → share → view → outcome, plus invoice creation and viewing). **However, `email_sent` for invoices currently omits `invoice_id`**, so invoice email traceability is incomplete until this is fixed. The smallest founder visibility path is a SQL/query doc or tiny report script against the existing `event_logs` table.
- No client-event endpoint is required for P1.

## 2. Event Vocabulary Table

### Legend
- **Persisted?** — Whether the event is written to the `event_logs` table under normal runtime (requires: `event in _PILOT_EVENT_NAMES`, `persist_async=True` (default), `user_id is not None`, session factory configured).
- **Payload fields** — Fields captured in `metadata_json` or the stdout JSON payload.
- **PII/sensitive risk** — Assessment of whether the payload could contain PII, transcripts, or secrets.
- **Redaction/allowlist status** — How the event is gated today.
- **Funnel stage** — Where the event sits in the contractor/customer journey.
- **Action** — Recommended next step for this PR or a follow-up.

| Event | Callsite | Persisted? | Payload fields | PII/sensitive risk | Redaction/allowlist status | Funnel stage | Action |
|---|---|---|---|---|---|---|---|
| `quote_started` | `app/features/quotes/extraction_service.py` | **Yes** | `user_id`, `detail` (capture type: audio/notes/audio+notes) | Low — no raw content | `_PILOT_EVENT_NAMES` allowlist | Intake — capture begins | Keep |
| `audio_uploaded` | `app/features/quotes/extraction_service.py` | **Yes** | `user_id`, `detail` | Low — no raw content | `_PILOT_EVENT_NAMES` allowlist | Intake — audio present | Keep |
| `draft_generated` | `app/features/quotes/extraction_outcomes.py` → `api.py`, `worker/job_registry.py` | **Yes** | `user_id`, `quote_id`, `customer_id`, `detail`, `extraction_outcome` (primary/degraded) | Low — outcome enum only | `_PILOT_EVENT_NAMES` allowlist; validation enforces `extraction_outcome` | Intake — draft ready | Keep |
| `draft_generation_failed` | `app/features/quotes/extraction_outcomes.py` → `extraction_service.py`, `api.py`, `worker/job_registry.py` | **Yes** | `user_id`, `detail` | Low | `_PILOT_EVENT_NAMES` allowlist | Intake — draft failed | Keep |
| `quote_pdf_generated` | `app/worker/job_registry.py` | **Yes** | `user_id`, `quote_id` | Low | `_PILOT_EVENT_NAMES` allowlist | Delivery — PDF artifact ready | Keep |
| `quote_shared` | `app/features/quotes/share/service.py` | **Yes** | `user_id`, `quote_id`, `customer_id` | Low | `_PILOT_EVENT_NAMES` allowlist | Delivery — share token created | Keep |
| `quote_approved` | `app/features/quotes/outcomes/service.py` | **Yes** | `user_id`, `quote_id`, `customer_id` | Low | `_PILOT_EVENT_NAMES` allowlist | Outcome — contractor marks won | Keep |
| `quote_marked_lost` | `app/features/quotes/outcomes/service.py` | **Yes** | `user_id`, `quote_id`, `customer_id` | Low | `_PILOT_EVENT_NAMES` allowlist | Outcome — contractor marks lost | Keep |
| `quote_viewed` | `app/features/quotes/share/service.py` | **Yes** | `user_id`, `quote_id`, `customer_id` | Low | `_PILOT_EVENT_NAMES` allowlist | Outcome — customer first view | Keep |
| `email_sent` (quote) | `app/features/quotes/email_delivery_service.py` | **NO** (intentionally skipped via `persist_async=False`) | `user_id`, `quote_id`, `customer_id` | Low | In `_PILOT_EVENT_NAMES`, but `persist_async=False` | Delivery — quote email dispatched | **Add to PR 2: either persist it or remove from allowlist** |
| `email_sent` (invoice) | `app/features/invoices/email_delivery_service.py` | **NO** (intentionally skipped via `persist_async=False`) | `user_id`, `customer_id` (**no `invoice_id`**) | Low | In `_PILOT_EVENT_NAMES`, but `persist_async=False` | Delivery — invoice email dispatched | **Add `invoice_id=context.invoice_id` in PR 2; persist or remove from allowlist** |
| `invoice_created` | `app/features/invoices/creation/service.py` | **Yes** | `user_id`, `customer_id`, `quote_id` (on conversion) | Low | `_PILOT_EVENT_NAMES` allowlist | Invoice lifecycle — created | Keep |
| `invoice_viewed` | `app/features/invoices/share/service.py` | **Yes** | `user_id`, `invoice_id`, `customer_id` | Low | `_PILOT_EVENT_NAMES` allowlist | Invoice lifecycle — customer first view | Keep |
| `quote.created` | `app/features/quotes/api.py`, `app/features/quotes/creation/service.py`, `app/worker/job_registry.py` | **NO** (not in allowlist) | `user_id`, `quote_id`, `customer_id` | Low | stdout-only | Intake — document persisted | **Consider adding to allowlist in PR 2 if quote creation volume is needed from events** |
| `manual_draft_created` | `app/features/quotes/api.py` | **NO** (not in allowlist) | `user_id`, `quote_id`, `customer_id` | Low | stdout-only | Intake — manual draft | **Consolidate or remove only after `quote.created` is allowlisted/persisted; otherwise manual draft creation becomes invisible in pilot reporting** |
| `quote.updated` | `app/features/quotes/mutation/service.py` | **NO** (not in allowlist) | `user_id`, `quote_id`, `customer_id` | Low | stdout-only | Editing — quote mutated | **Consider adding to allowlist in PR 2 if edit volume matters** |
| `quote.deleted` | `app/features/quotes/deletion/service.py` | **NO** (not in allowlist) | `user_id`, `quote_id`, `customer_id` | Low | stdout-only | Editing — quote deleted | Keep stdout-only; deletions are low-signal for P1 |
| `customer.created` | `app/features/customers/service.py` | **NO** (not in allowlist) | `user_id`, `customer_id` | Low | stdout-only | CRM — new customer | **Consider adding to allowlist in PR 2 for growth signals** |
| `customer.deleted` | `app/features/customers/service.py` | **NO** (not in allowlist) | `user_id`, `customer_id`, `detail` (deleted quote/invoice counts) | Low | stdout-only | CRM — customer removed | Keep stdout-only |
| `invoice_paid` | `app/features/invoices/outcomes/service.py` | **NO** (not in allowlist) | `user_id`, `invoice_id`, `customer_id` | Low | stdout-only | Invoice lifecycle — paid | **Add to `_PILOT_EVENT_NAMES` in PR 2: critical conversion signal** |
| `invoice_voided` | `app/features/invoices/outcomes/service.py` | **NO** (not in allowlist) | `user_id`, `invoice_id`, `customer_id` | Low | stdout-only | Invoice lifecycle — voided | **Add to `_PILOT_EVENT_NAMES` in PR 2 if void tracking is required** |

### Missing Events (no callsite exists)

| Event | Expected Callsite | Funnel Stage | Action |
|---|---|---|---|
| `invoice_shared` | `app/features/invoices/share/service.py` (missing) | Invoice lifecycle — share token created | **Add `log_event` callsite and add to `_PILOT_EVENT_NAMES` in PR 2** |
| `invoice_sent` | `app/features/invoices/email_delivery_service.py` (uses generic `email_sent`) | Invoice lifecycle — email dispatched | **Defer: generic `email_sent` covers this if persisted in PR 2, but note that `invoice_id` is not currently passed — add `invoice_id` before relying on this for invoice email traceability** |

### Duplicated / Stale Events

1. **`manual_draft_created` + `quote.created`** — `POST /quotes/manual-draft` emits both events for a single action. `manual_draft_created` is redundant because `quote.created` already covers it.
2. **`quote.created` is emitted in 3 places** (API, service, worker) but is stdout-only, so it cannot be used for reliable cross-path counting today.

## 3. Sensitive Payload Findings

### 3.1 Extraction trace raw content risk (HIGH — confirmed)

**Location:** `backend/app/integrations/extraction.py`

`log_extraction_trace` is called with `raw_transcript` and `raw_tool_payload` at the following stages:
- `stage=tier.tier, outcome="started"` (lines 514–522: `raw_transcript` at line 522)
- `stage=tier.tier, outcome="provider_response"` (lines 559–579: `raw_transcript` at 577, `raw_tool_payload` at 578)
- `stage="repair", outcome="started"` (lines 610–621: `raw_transcript` at 619, `raw_tool_payload` at 620)
- `stage="repair", outcome="failed"` (lines 685–699: `raw_transcript` at 697, `raw_tool_payload` at 698)
- `stage="repair", outcome="succeeded"` (lines 719–740: `raw_transcript` at 738, `raw_tool_payload` at 739)
- `_log_result_trace` → `stage="result", outcome="succeeded"` (lines 1459–1474: `raw_transcript` at 1472, `raw_tool_payload` at 1473)

**Current mitigation:** `app/shared/extraction_logger.py` defaults `_INCLUDE_RAW_CONTENT = False`, so these fields are stripped from the JSON payload before logging.

**Risk:** If `configure_extraction_logging(include_raw_content=True)` is ever called (e.g., in a debugging session or misconfigured environment), raw voice transcripts and structured extraction output would be written to stdout/logs. This violates the hard guardrail: *No raw notes, transcripts, audio, LLM prompts/responses, raw tool payloads … in telemetry/log payloads.*

**Decision:** Route the fix to **Spec 9** (production security & LLM safety) per project convention. This PR documents the finding only.

### 3.2 `log_event` structured payload risk (LOW)

The `log_event` function only accepts a closed set of fields: `user_id`, `quote_id`, `invoice_id`, `customer_id`, `detail`, `extraction_outcome`. The `detail` field is caller-controlled but, in practice, only receives short enum-like strings (`"audio"`, `"notes"`, `"audio+notes"`, counts). No raw transcripts or contact data are passed through `log_event` today.

### 3.3 `event_logs` table schema risk (LOW)

`backend/app/features/event_logs/models.py`:
- `metadata_json` is typed as `dict[str, str]` with `sa.JSON`.
- No encryption at rest is implemented, but the table only stores UUIDs and short structured metadata.
- No raw content fields exist in the model.

## 4. Recommended PR 2 Scope

PR 2 should be the smallest code change that closes the persistence gaps blocking P1 visibility.

1. **Persist `email_sent`**
   - Remove `persist_async=False` from both `QuoteEmailDeliveryService` and `InvoiceEmailDeliveryService`.
   - **Add `invoice_id=context.invoice_id`** to the invoice `email_sent` call in `InvoiceEmailDeliveryService` — currently only `user_id` and `customer_id` are passed, so invoice emails lose traceability to the specific invoice. This must be fixed before or alongside persisting.
   - Rationale: Email volume is a key delivery signal; it is already in `_PILOT_EVENT_NAMES` and low-risk.

2. **Add `invoice_paid` to `_PILOT_EVENT_NAMES`**
   - Rationale: Critical conversion signal for invoice lifecycle; currently stdout-only.

3. **Add `invoice_shared` event**
   - Add `log_event("invoice_shared", ...)` to `InvoiceShareService.share_invoice`.
   - Add `"invoice_shared"` to `_PILOT_EVENT_NAMES`.
   - Rationale: Symmetry with `quote_shared`; needed for delivery funnel visibility.

4. **Consolidate `manual_draft_created` (conditional)**
   - Remove the `manual_draft_created` event from `POST /quotes/manual-draft`; rely on `quote.created` only.
   - **Condition:** Do this only after `quote.created` is added to `_PILOT_EVENT_NAMES` (or another equivalent event is persisted). If `quote.created` remains stdout-only, removing `manual_draft_created` would make manual draft creation invisible in pilot reporting.
   - Rationale: Eliminates duplicate emission for the same action without losing visibility.

5. **Optional: add `quote.created` to `_PILOT_EVENT_NAMES`**
   - Rationale: Enables reliable quote creation counting from the events table (complementing DB counts).
   - Defer if not needed for P1.

6. **Optional: add `customer.created` to `_PILOT_EVENT_NAMES`**
   - Rationale: Growth signal for pilot users adding customers.
   - Defer if not needed for P1.

**Out of scope for PR 2:**
- Raw extraction trace redaction fix → **Spec 9**.
- New client-event endpoint.
- External analytics integration.
- Dashboards or UI changes.

## 5. Recommended PR 3 Founder Visibility Path

**Decision:** Backend events only + SQL/query doc.

No client-event endpoint is required because every P1 signal can be observed server-side:
- Quote funnel: `quote_started` → `draft_generated`/`draft_generation_failed` → `quote_shared` → `quote_viewed` → `quote_approved`/`quote_marked_lost`
- Invoice funnel: `invoice_created` → `invoice_shared` (after PR 2) → `invoice_viewed` → `invoice_paid` (after PR 2)
- Delivery: `email_sent` (after PR 2), `quote_pdf_generated`
- Quality: `extraction_outcome` metadata on `draft_generated`

**Deliverable:**
Create `docs/telemetry/pilot-funnel-queries.sql` (or a tiny script under `scripts/telemetry-report.py`) containing:

1. **Daily event counts** — grouped by `event_name` and date.
2. **Quote conversion funnel** — step-through rates from `quote_started` to `quote_approved`/`quote_marked_lost`.
3. **Invoice conversion funnel** — from `invoice_created` to `invoice_paid`.
4. **Extraction quality** — percentage of `draft_generated` with `extraction_outcome = 'degraded'`.
5. **Email volume** — daily `email_sent` counts.
6. **Weekly active users (WAU)** — distinct `user_id` in `event_logs` per week.

The founder can run these against the production read replica or via a simple `psql` / `pgcli` invocation. No application code is required.

## 6. Explicit Deferrals

| Item | Reason | Deferred To |
|---|---|---|
| Third-party analytics SDK | Hard guardrail | Post-P1 |
| Session replay | Hard guardrail | Never (not applicable) |
| Broad client-event ingestion endpoint | Hard guardrail | Never |
| Arbitrary JSON event payloads | Hard guardrail | Never |
| Raw transcript/tool payload redaction in extraction traces | Scoped to Spec 9 | **Spec 9** |
| Dashboards / UI telemetry views | Out of P1 Spec 1 scope | Later Spec |
| Sentry alerting changes | Out of audit scope | **#618** (observability & security alerting) |
| `quote.updated` / `quote.deleted` persistence | Low signal for P1 | PR 2 optional or later |
| `invoice_voided` persistence | Low signal unless required by ops | PR 2 optional |
| User onboarding events (signup/login) | Not in current event vocabulary | Future spec |

## 7. Verification Performed

- **Readback/self-review:** All `log_event(...)` callsites were manually traced across the backend codebase using grep and file reads.
- **`_PILOT_EVENT_NAMES` audit:** Verified against `backend/app/shared/event_logger.py` lines 22–38 and `backend/app/shared/tests/test_event_logger.py` lines 351–365.
- **Persistence logic audit:** Verified the early-return conditions in `log_event` (lines 90–96 of `event_logger.py`).
- **Sensitive payload audit:** Reviewed `backend/app/integrations/extraction.py` and `backend/app/shared/extraction_logger.py` for raw content leakage paths.
- **Frontend audit:** Confirmed zero telemetry calls in `frontend/` via glob/grep.
- **No code changes were made**, so no backend static verification or pytest runs were required.
- **Reviewer-verified recount:** Independent scripted enumeration of all `log_event(` callsites in `backend/app/` (excluding test files) confirmed 20 distinct event names across 15 modules. Original audit count of 21 was corrected to 20; the derived "9 stdout-only" count was corrected to 8. Invoice `email_sent` was confirmed to lack `invoice_id` in its payload.

## 8. Decision Section

**Q: Backend events only?**  
**A: Yes.** Every P1 pilot signal can be derived from existing (or PR 2 patched) backend events.

**Q: Backend events + SQL/query doc?**  
**A: Yes — this is the recommended PR 3 path.**

**Q: Backend events + tiny script/report?**  
**A: Acceptable alternative to SQL doc.** A small Python script that runs the same queries and emits markdown/CSV is fine if the founder prefers it.

**Q: Minimal internal route?**  
**A: Not needed for P1.** The events table can be queried directly by a founder with read-only DB access.

**Q: Minimal allowlisted client-event endpoint?**  
**A: Not needed.** The audit proves all required signals are observable server-side.

**Q: External analytics deferred?**  
**A: Yes — indefinitely for P1.**
