# Execution Brief — Task #204

- Task issue: `#204`
- Task title: `Task: Queue and job-status foundation`
- Source of truth: https://github.com/odysian/stima/issues/204

## Goal

Introduce the minimum Redis-backed worker infrastructure and job-status model that Tasks 6b, 6c, and 6d can build on without reworking the base contract. This task delivers the foundation only — no domain work migrates in this PR.

## Non-goals

- Extraction, PDF, or email migration (Tasks 6b, 6c, 6d)
- Persisted artifact invalidation rules (Task 7)
- Perimeter hardening or dependency scanning
- Any frontend changes

## Files In Scope

- `backend/app/worker/` — new package; `arq_worker.py` (worker startup, `WorkerSettings`), `job_registry.py` (placeholder task function stubs for extraction/PDF/email — not wired up yet, present so 6b/6c/6d can import from a stable location)
- `backend/app/features/jobs/` — new feature package; `models.py` (SQLAlchemy `JobRecord` model with `id`, `job_type`, `status`, `created_at`, `updated_at`, `attempts`, `terminal_error`), `repository.py` (basic CRUD), `schemas.py` (status enum + response type)
- `backend/app/features/registry.py` — import `JobRecord` so Alembic discovers it
- `backend/app/core/config.py` — add `WORKER_CONCURRENCY: int` (default `10`); `REDIS_URL` already added in Task 2a
- `backend/alembic/versions/` — new migration: `job_records` table
- `backend/app/main.py` — no change required; worker runs as a separate process

## Analog Files / Docs

- `backend/app/features/registry.py` — follow the existing import pattern when registering `JobRecord`
- `backend/app/features/event_logs/models.py` — shape reference for a lightweight append-only model; `JobRecord` is similar but mutable (status updates)

## Locked Decisions

- **Worker library: ARQ** (`arq` package). Fits the existing `asyncio`-first posture, uses Redis natively, requires no separate broker process. Add `arq==0.27.0` to `requirements.txt`. To satisfy ARQ's `redis<6` dependency constraint, downgrade the Redis client pin to `redis==5.3.1`; `redis==5.0.12` was requested during implementation but does not exist on PyPI, so the pin was corrected to the latest stable `<6` release instead. This does not change the Upstash URL contract or the existing `redis.asyncio` API usage in the app. Note: ARQ is in maintenance-only mode upstream — no new features expected, but the API is stable and appropriate for this use case.
- **Job status enum:** `pending | running | success | failed | terminal`. `terminal` is the final state after exhausting retries; `failed` is a retriable transient failure.
- **Retry policy defaults:** max 3 attempts, exponential backoff with jitter between attempts; configurable via `WorkerSettings`. Terminal state is reached after `max_attempts` — do not silently discard terminal failures.
- **`JobRecord` persistence:** DB-backed, not Redis-only. Redis holds the queue and in-flight state; DB holds the durable audit record. Tasks 6b/6c/6d will create `JobRecord` rows when they enqueue jobs.
- **Job type enum:** `extraction | pdf | email`. Domain tasks (6b/6c/6d) add the actual ARQ task functions; this task provides the enum and empty stubs so import paths are stable.
- **Worker runs as a separate process:** `python -m arq app.worker.arq_worker.WorkerSettings`. Document the startup command in the PR and in a runbook stub (full runbook lands in Task 8).
- **`job_records` schema:**

  | Column | Type | Notes |
  |---|---|---|
  | `id` | UUID PK | |
  | `job_type` | String(20) | `extraction \| pdf \| email` |
  | `status` | String(20) | status enum above |
  | `document_id` | UUID FK → documents | nullable; set by domain tasks |
  | `user_id` | UUID FK → users | cascade delete |
  | `attempts` | Integer | default 0 |
  | `terminal_error` | Text | nullable; set on terminal failure |
  | `created_at`, `updated_at` | DateTime(tz) | server defaults |

- **Enum constraint pattern:** Use `sa.Enum(native_enum=False, create_constraint=True, ...)` for both `status` and `job_type` columns, matching the `Document.status` pattern in `backend/app/features/quotes/models.py:67-79`. Do **not** use unconstrained `String(20)`. Concrete example:

  ```python
  class JobStatus(StrEnum):
      PENDING = "pending"
      RUNNING = "running"
      SUCCESS = "success"
      FAILED = "failed"
      TERMINAL = "terminal"

  class JobType(StrEnum):
      EXTRACTION = "extraction"
      PDF = "pdf"
      EMAIL = "email"

  # In JobRecord model:
  status: Mapped[JobStatus] = mapped_column(
      sa.Enum(
          JobStatus,
          values_callable=lambda e: [m.value for m in e],
          native_enum=False,
          create_constraint=True,
          name="job_status",
          length=20,
      ),
      nullable=False,
      server_default=JobStatus.PENDING.value,
  )
  job_type: Mapped[JobType] = mapped_column(
      sa.Enum(
          JobType,
          values_callable=lambda e: [m.value for m in e],
          native_enum=False,
          create_constraint=True,
          name="job_type",
          length=20,
      ),
      nullable=False,
  )
  ```

## Acceptance Criteria Delta

- `JobRecord` status transitions are tested: `pending → running → success` and `pending → running → failed → terminal` after exhausting retries
- Worker misconfiguration test: worker raises at startup when Redis is unreachable (not silently degraded)
- `JobRecord` is imported in `registry.py` and Alembic migration creates the table cleanly

## Verification

```bash
make backend-verify
make db-verify
```

`make db-verify` is human/CI path only — do not run in agent session.

## Open Product Decisions / Blockers

- Shared vs per-domain job status model: spec whiteboard question #3 asks whether one shared model or smaller per-domain status fields is preferred; this task locks one shared `JobRecord` model as the default — if that is overturned during whiteboarding, it must happen before Task 6a kickoff, not mid-implementation
- Depends on Task 2a being merged (`REDIS_URL` config and Redis connection available)
