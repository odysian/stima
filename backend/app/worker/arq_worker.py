"""ARQ worker entrypoint used by the CLI and deployment scripts."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.core.config import get_settings
from app.worker.job_registry import registered_functions
from app.worker.runtime import DEFAULT_MAX_TRIES, build_arq_redis_settings, on_worker_startup


class _LazyWorkerSetting:
    """Descriptor that resolves worker settings from runtime config on access."""

    def __init__(self, factory: Callable[[], Any]) -> None:
        self._factory = factory

    def __get__(self, obj: object, owner: type[object]) -> Any:
        del obj
        del owner
        return self._factory()


class WorkerSettings:
    """Canonical ARQ worker settings for background job execution."""

    functions = registered_functions()
    on_startup = on_worker_startup
    max_tries = DEFAULT_MAX_TRIES
    max_jobs = _LazyWorkerSetting(lambda: get_settings().worker_concurrency)
    redis_settings = _LazyWorkerSetting(lambda: build_arq_redis_settings(get_settings()))
