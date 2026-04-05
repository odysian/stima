# Queue Worker Runbook Stub

Task `#204` introduces the shared ARQ worker foundation used by later extraction, PDF, and email migration tasks.

## Start the worker

```bash
cd backend
.venv/bin/python -m arq app.worker.arq_worker.WorkerSettings
```

## Current scope

- Redis is required; worker startup fails fast when Redis is unreachable.
- `job_records` stores durable job status in Postgres while Redis holds queued and in-flight work.
- Extraction, PDF, and email handlers are placeholder entrypoints in this task only; Tasks `6b`, `6c`, and `6d` wire the real domain work into these stable import paths.

Full operational guidance, monitoring, and recovery procedures land in Task `8`.
