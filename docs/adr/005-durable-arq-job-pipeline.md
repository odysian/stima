# ADR-005: Durable ARQ Job Pipeline for Extraction, PDF, and Email Work

**Date:** 2026-04-29
**Status:** Accepted
**Spec/Task:** P0/P1 async document pipeline and production-readiness work

---

## Context

Stima performs several operations that are too slow or failure-prone to treat as ordinary request/response work:

- AI extraction may require transcription, LLM calls, provider retries, fallback/degraded behavior, and draft persistence.
- PDF generation may require rendering, logo fetching, artifact storage, revision checks, and retry/error handling.
- Email delivery depends on provider availability and should be idempotent/recoverable.

A purely synchronous API would make the user wait on external services and would be fragile under mobile network conditions. A purely in-memory task approach would be simpler but would not be durable enough for real pilot use: if the API process restarts after accepting work, the task could disappear.

The current repo uses a durable job row plus ARQ queue pattern:

- `job_records` stores job id, user id, optional document id, optional document revision, job type, status, attempts, model id, terminal error, and result JSON.
- ARQ registers stable job names:
  - `jobs.extraction`
  - `jobs.pdf`
  - `jobs.email`
- API endpoints create or reuse durable job rows before/while enqueueing work.
- Worker runtime wraps job handlers with status transitions, retry handling, terminal failure logging, and correlation id binding.
- Retryable errors use ARQ retry with deterministic jitter.
- Non-retryable errors transition jobs to terminal with a reason code.
- PDF jobs use document revisions to avoid persisting stale artifacts after the document changes.
- Email jobs use stored job/document context and idempotency protection at the API edge.

## Options Considered

### Option A: Keep all heavy work synchronous

Run extraction/PDF/email directly inside HTTP requests.

**Pros:**

- simpler implementation;
- fewer moving pieces;
- easier local debugging;
- immediate success/failure response.

**Cons:**

- long requests on mobile networks;
- provider failures block the UI;
- harder to retry safely;
- API process restarts can interrupt work;
- poor fit for PDF/email workflows that may take several seconds;
- extraction success cannot be resumed/polled by the frontend.

### Option B: In-process FastAPI `BackgroundTasks`

Accept requests quickly and run work after response in the same process.

**Pros:**

- very easy to implement;
- no Redis/worker process needed;
- useful for fire-and-forget side effects.

**Cons:**

- not durable across process restart/crash;
- difficult to inspect or poll status;
- weak retry/terminal-state story;
- not appropriate for important quote persistence, PDF artifacts, or email delivery.

### Option C: ARQ queue only, no durable application job table

Use ARQ job ids as the source of truth.

**Pros:**

- avoids a custom job table;
- queue handles retries and scheduling;
- less database state.

**Cons:**

- application cannot easily expose domain-specific status;
- hard to associate job success with quote/document ids;
- harder to preserve terminal error reasons, model ids, or document revisions;
- frontend would depend too directly on queue implementation details.

### Option D: Durable application job row plus ARQ execution (chosen)

Use database job records as the product-facing state and ARQ as the execution engine.

**Pros:**

- API can expose stable job status through `/api/jobs/{job_id}`;
- frontend can poll a durable app contract, not ARQ internals;
- extraction jobs can expose `quote_id` once the persisted draft exists;
- PDF jobs can protect against stale document revisions;
- terminal failures can be recorded and surfaced consistently;
- retries can be classified by domain error type.

**Cons:**

- more infrastructure: Redis, worker process, job table, status transitions;
- API and worker must keep job state consistent;
- enqueue failure after job-row creation requires explicit handling;
- local/dev setup is slightly heavier.

## Decision

Choose **Option D: durable application job records plus ARQ execution**.

ARQ is the worker execution mechanism, but the database `job_records` table is the application source of truth for user-visible job lifecycle state.

Job categories:

- `extraction`: accepts prepared capture input, runs provider extraction, persists a draft quote, stores the resulting quote id on the job record, and stores extraction result JSON for compatibility.
- `pdf`: renders and persists a versioned PDF artifact; protects against stale document revisions.
- `email`: delivers quote/invoice email from stored document context.

Status model:

- `pending`: job row exists and is queued or waiting.
- `running`: worker attempt has started.
- `success`: job completed and any required persistence side effect is committed.
- `failed`: transient failed attempt, eligible for retry.
- `terminal`: final failure, not expected to recover automatically.

The API should return `202 JobRecordResponse` for accepted async work. The frontend should poll the app job endpoint and react to domain fields (`quote_id`, `status`, `terminal_error`) instead of ARQ internals.

## Consequences

**Reliability:**

- Accepted async work is visible and pollable even if the worker takes time.
- Retryable provider errors can be retried without blocking the request.
- Terminal failures have durable reason codes.
- Worker startup fails fast if Redis is missing, instead of silently pretending async work is available.

**Product behavior:**

- Users can see or recover from long-running extraction/PDF/email work.
- Extraction can be marked successful only after a quote draft is persisted.
- PDF generation can avoid stale artifact writes by comparing document revisions.
- Email sends can be retried safely through idempotency and job records.

**Operational impact:**

- Production requires Redis/ARQ worker health as part of readiness.
- Runbooks must cover worker startup, Redis config, stale jobs, and queue failures.
- Logs should include correlation ids and safe structured metadata, not raw user content.

**Maintainability:**

- New background job types should use the same pattern: durable row first, stable job name, worker handler, domain-specific success/terminal handling, tests for enqueue failure and job polling.
- Job response schemas must remain stable for frontend polling.
- Do not let frontend code depend on ARQ-specific behavior.

**Security/privacy:**

- Job records may carry document/user ids and limited status metadata.
- Job records should not store raw audio, prompts, provider responses, or customer-facing document content beyond explicitly reviewed safe fields.
- Extraction result JSON exists for backward compatibility; avoid expanding it into raw prompt/provider payload storage.

**Revisit triggers:**

- If queue volume grows beyond ARQ/Redis simplicity, consider a more managed queue or workflow engine.
- If jobs need cancellation, pause/resume, or audit timeline semantics, add those as explicit job lifecycle extensions.
- If P1 observability finds frequent stuck jobs, add a reaper/reconciliation path and document it in the runbook.

## Evidence Reviewed

- `backend/app/features/jobs/models.py`
- `backend/app/features/jobs/schemas.py`
- `backend/app/features/jobs/service.py`
- `backend/app/worker/job_registry.py`
- `backend/app/worker/runtime.py`
- `backend/app/features/quotes/api.py`
- `backend/app/features/quotes/service.py`
- `frontend/src/shared/lib/jobService.ts`
- `frontend/src/features/quotes/offline/outboxEngine.ts`
- `docs/ARCHITECTURE.md`
- `docs/runbooks/worker-startup-monitoring.md`
- `docs/runbooks/queue-worker.md`
