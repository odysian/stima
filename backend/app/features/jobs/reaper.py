"""Background task that reaps stale extraction jobs."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.features.jobs.repository import JobRepository
from app.features.jobs.service import JobService

LOGGER = logging.getLogger(__name__)
_STALE_EXTRACTION_REASON = "job_not_picked_up"


async def reap_stale_extraction_jobs_once(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    stale_ttl_seconds: int,
) -> int:
    """Run one stale extraction job cleanup pass with an isolated DB session."""
    cutoff = datetime.now(UTC) - timedelta(seconds=stale_ttl_seconds)
    async with session_factory() as session:
        service = JobService(repository=JobRepository(session))
        reaped_count = await service.reap_stale_extraction_jobs(
            older_than=cutoff,
            reason=_STALE_EXTRACTION_REASON,
        )
        if reaped_count > 0:
            await session.commit()
        else:
            await session.rollback()
        return reaped_count


async def run_stale_extraction_job_reaper(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    interval_seconds: int,
    stale_ttl_seconds: int,
) -> None:
    """Repeatedly reap stale extraction jobs until application shutdown."""
    while True:
        try:
            reaped_count = await reap_stale_extraction_jobs_once(
                session_factory=session_factory,
                stale_ttl_seconds=stale_ttl_seconds,
            )
            if reaped_count > 0:
                LOGGER.warning(
                    "Reaped %s stale extraction job(s) older than %s seconds",
                    reaped_count,
                    stale_ttl_seconds,
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            LOGGER.warning("Failed stale extraction job reaper pass", exc_info=True)

        await asyncio.sleep(interval_seconds)
