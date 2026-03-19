"""Rate-limit primitives shared by API modules."""

from __future__ import annotations

import ipaddress

from fastapi import Request
from slowapi import Limiter

from app.core.config import get_settings


def _parse_ip(value: str) -> str | None:
    try:
        return str(ipaddress.ip_address(value.strip()))
    except ValueError:
        return None


def _is_trusted_proxy(peer_ip: str) -> bool:
    trusted_proxies = get_settings().trusted_proxy_ips
    peer_ip_obj = _parse_ip(peer_ip)
    if peer_ip_obj is None:
        return False

    for candidate in trusted_proxies:
        try:
            network = ipaddress.ip_network(candidate, strict=False)
        except ValueError:
            continue
        if ipaddress.ip_address(peer_ip_obj) in network:
            return True
    return False


def get_ip_key(request: Request) -> str:
    """Resolve rate-limit key from client IP, proxy-aware when trusted."""
    peer_ip = request.client.host if request.client is not None else "127.0.0.1"

    if _is_trusted_proxy(peer_ip):
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            first_hop = forwarded_for.split(",")[0]
            parsed_hop = _parse_ip(first_hop)
            if parsed_hop is not None:
                return parsed_hop

    parsed_peer = _parse_ip(peer_ip)
    return parsed_peer or "127.0.0.1"


limiter = Limiter(key_func=get_ip_key)
