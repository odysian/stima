# Worker Startup And Monitoring

The ARQ worker is responsible for extraction, PDF, and email jobs backed by `job_records` in Postgres and Redis queue state.

## Start the worker

```bash
cd backend
.venv/bin/python -m arq app.worker.arq_worker.WorkerSettings
```

## Preconditions

- `REDIS_URL` is set and reachable.
- Database migrations are up to date.
- The same runtime env vars used by the API are available to the worker.

## What healthy startup looks like

- Worker boot completes without Redis ping failures.
- New `job_records` move from `pending` to `running` when the worker is online.
- Structured logs carry a generated correlation ID per job execution path.

## Monitoring focus

- Watch `job_records.status` for stuck `pending` or growing `terminal` counts.
- Watch structured `provider.retry_scheduled`, `provider.quota_exhausted`, and `jobs.terminal_failure` events.
- Confirm the stale extraction reaper is active in the API process so abandoned extraction jobs do not poll forever.

## Recovery steps

1. Verify Redis reachability first.
2. Restart the worker process.
3. Inspect recent `jobs.terminal_failure` events for one repeated `job_name` or `error_class`.
4. If queueing recovered but old jobs remain terminal, requeue through the normal product flow instead of mutating job rows in place.

## Related runbooks

- [redis-provisioning-config.md](/home/odys/stima/docs/runbooks/redis-provisioning-config.md)
- [production-readiness-checklist.md](/home/odys/stima/docs/runbooks/production-readiness-checklist.md)
