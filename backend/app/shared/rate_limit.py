"""Rate-limit primitives shared by API modules."""

from __future__ import annotations

import ipaddress

from fastapi import Request
from slowapi import Limiter

from app.core.config import get_settings

IpNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network


def _parse_ip(value: str) -> str | None:
    try:
        return str(ipaddress.ip_address(value.strip()))
    except ValueError:
        return None


def _trusted_proxy_networks() -> list[IpNetwork]:
    networks: list[IpNetwork] = []
    for candidate in get_settings().trusted_proxy_ips:
        try:
            network = ipaddress.ip_network(candidate, strict=False)
        except ValueError:
            continue
        networks.append(network)
    return networks


def _is_trusted_proxy(peer_ip: str, trusted_networks: list[IpNetwork]) -> bool:
    peer_ip_obj = _parse_ip(peer_ip)
    if peer_ip_obj is None:
        return False
    resolved_ip = ipaddress.ip_address(peer_ip_obj)
    return any(resolved_ip in network for network in trusted_networks)


def _resolve_forwarded_client_ip(
    forwarded_for: str,
    *,
    peer_ip: str,
    trusted_networks: list[IpNetwork],
) -> str | None:
    raw_chain = [entry.strip() for entry in forwarded_for.split(",") if entry.strip()]
    if not raw_chain:
        return None

    # Walk right-to-left: peer_ip is guaranteed trusted by the caller.
    # Stop and return None at the first unparsable entry — anything to its
    # left is client-controlled and unverifiable.
    for hop in reversed(raw_chain):
        parsed_hop = _parse_ip(hop)
        if parsed_hop is None:
            return None
        if not _is_trusted_proxy(parsed_hop, trusted_networks):
            return parsed_hop

    return None  # Every XFF hop was also a trusted proxy


def get_ip_key(request: Request) -> str:
    """Resolve rate-limit key from client IP, proxy-aware when trusted."""
    raw_peer_ip = request.client.host if request.client is not None else "127.0.0.1"
    peer_ip = _parse_ip(raw_peer_ip) or "127.0.0.1"
    trusted_networks = _trusted_proxy_networks()

    if _is_trusted_proxy(peer_ip, trusted_networks):
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            resolved_client = _resolve_forwarded_client_ip(
                forwarded_for,
                peer_ip=peer_ip,
                trusted_networks=trusted_networks,
            )
            if resolved_client is not None:
                return resolved_client

        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            parsed_real_ip = _parse_ip(real_ip)
            if parsed_real_ip is not None:
                return parsed_real_ip

    return peer_ip


limiter = Limiter(key_func=get_ip_key)
