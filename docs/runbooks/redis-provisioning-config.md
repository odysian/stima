# Redis Provisioning And Config

Redis is a required runtime dependency for distributed rate limiting, idempotency replay state, and ARQ-backed background jobs.

## Required config

- `REDIS_URL`
  Use `rediss://...` in production when the provider supports TLS.
- `REDIS_KEY_PREFIX`
  Keep the default `stima` unless another explicit namespace is agreed.

## Provisioning requirements

- Use a managed Redis deployment with persistence and alerting appropriate for production.
- Keep Stima isolated to its own logical DB and key namespace.
- Prefer `noeviction` or a capacity plan that avoids evicting idempotency, limiter, or queue keys under normal load.
- Restrict network access to the backend and worker runtime only.

## Validation

1. Confirm the API process starts with `REDIS_URL` set and does not fall back unexpectedly.
2. Start the worker and confirm startup Redis ping succeeds.
3. Exercise one idempotent email endpoint twice with the same `Idempotency-Key` and confirm the second response is replayed.
4. Exercise one public or auth route rate limit in a non-production environment and confirm `429` behavior is enforced.

## Failure signals

- Worker startup fails fast on Redis connectivity errors.
- API falls back to degraded local-only behavior where Redis-backed guarantees are expected.
- Replayed requests stop returning the same persisted response.
- Rate limits behave inconsistently across multiple app instances.

## Related runbooks

- [worker-startup-monitoring.md](/home/odys/stima/docs/runbooks/worker-startup-monitoring.md)
- [production-readiness-checklist.md](/home/odys/stima/docs/runbooks/production-readiness-checklist.md)
