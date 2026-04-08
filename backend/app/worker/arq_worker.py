"""ARQ worker entrypoint used by the CLI and deployment scripts."""

from __future__ import annotations

from app.core.config import get_settings
from app.worker.job_registry import registered_functions
from app.worker.runtime import DEFAULT_MAX_TRIES, build_arq_redis_settings, on_worker_startup

_settings = get_settings()


class WorkerSettings:
    """Canonical ARQ worker settings for background job execution."""

    functions = registered_functions()
    on_startup = on_worker_startup
    max_tries = DEFAULT_MAX_TRIES
    max_jobs = _settings.worker_concurrency
    redis_settings = build_arq_redis_settings(_settings)
    poll_delay = _settings.worker_poll_delay_seconds
