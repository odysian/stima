"""Rate-limit primitives shared by API modules."""

from __future__ import annotations

from fastapi import Request
from slowapi import Limiter

from app.core.config import get_settings
from app.shared.proxy_headers import (
    IpNetwork,
    is_trusted_proxy,
    parse_ip,
    resolve_forwarded_client_ip,
    trusted_proxy_networks,
)


def get_ip_key(request: Request) -> str:
    """Resolve rate-limit key from client IP, proxy-aware when trusted."""
    raw_peer_ip = request.client.host if request.client is not None else "127.0.0.1"
    peer_ip = parse_ip(raw_peer_ip) or "127.0.0.1"
    trusted_networks = _trusted_proxy_networks()

    if is_trusted_proxy(peer_ip, trusted_networks):
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            resolved_client = _resolve_forwarded_client_ip(
                forwarded_for,
                trusted_networks=trusted_networks,
            )
            if resolved_client is not None:
                return resolved_client

        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            parsed_real_ip = parse_ip(real_ip)
            if parsed_real_ip is not None:
                return parsed_real_ip

    return peer_ip


limiter = Limiter(key_func=get_ip_key)


def _trusted_proxy_networks() -> list[IpNetwork]:
    return trusted_proxy_networks(get_settings().trusted_proxy_ips)


def _resolve_forwarded_client_ip(
    forwarded_for: str,
    *,
    trusted_networks: list[IpNetwork],
) -> str | None:
    return resolve_forwarded_client_ip(
        forwarded_for,
        trusted_networks=trusted_networks,
    )
