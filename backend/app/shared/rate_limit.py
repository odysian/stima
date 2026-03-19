"""Rate-limit primitives shared by API modules."""

from __future__ import annotations

from fastapi import Request
from slowapi import Limiter


def get_ip_key(request: Request) -> str:
    """Resolve rate-limit key from client IP address."""
    if request.client is None:
        return "unknown"
    return request.client.host


limiter = Limiter(key_func=get_ip_key)
