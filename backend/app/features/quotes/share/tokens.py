"""Token lifecycle helpers for quote share links."""

from __future__ import annotations

from datetime import datetime, timedelta

from app.core.config import get_settings


def _build_share_token_expiry(created_at: datetime) -> datetime:
    return created_at + timedelta(days=get_settings().public_share_link_expire_days)


def _share_token_has_expired(expires_at: datetime | None, now: datetime) -> bool:
    return expires_at is not None and expires_at < now
