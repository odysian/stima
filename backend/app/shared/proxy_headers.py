"""Trusted proxy parsing helpers shared by request-boundary code."""

from __future__ import annotations

import ipaddress

from starlette.types import ASGIApp, Receive, Scope, Send

IpNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network


def parse_ip(value: str) -> str | None:
    """Normalize an IP literal or return None when parsing fails."""
    try:
        return str(ipaddress.ip_address(value.strip()))
    except ValueError:
        return None


def trusted_proxy_networks(candidates: list[str]) -> list[IpNetwork]:
    """Build trusted proxy networks from exact IPs or CIDR ranges."""
    networks: list[IpNetwork] = []
    for candidate in candidates:
        try:
            networks.append(ipaddress.ip_network(candidate, strict=False))
        except ValueError:
            continue
    return networks


def is_trusted_proxy(peer_ip: str, trusted_networks: list[IpNetwork]) -> bool:
    """Return true when the peer IP belongs to a trusted proxy range."""
    resolved_ip = parse_ip(peer_ip)
    if resolved_ip is None:
        return False
    peer_ip_obj = ipaddress.ip_address(resolved_ip)
    return any(peer_ip_obj in network for network in trusted_networks)


def resolve_forwarded_client_ip(
    forwarded_for: str,
    *,
    trusted_networks: list[IpNetwork],
) -> str | None:
    """Walk an X-Forwarded-For chain right-to-left and return the first untrusted hop."""
    raw_chain = [entry.strip() for entry in forwarded_for.split(",") if entry.strip()]
    if not raw_chain:
        return None

    for hop in reversed(raw_chain):
        parsed_hop = parse_ip(hop)
        if parsed_hop is None:
            return None
        if not is_trusted_proxy(parsed_hop, trusted_networks):
            return parsed_hop

    return None


class TrustedProxyHeadersMiddleware:
    """Apply trusted proxy forwarding headers only for configured peer IPs."""

    def __init__(self, app: ASGIApp, trusted_proxy_ips: list[str]) -> None:
        self.app = app
        self.trusted_networks = trusted_proxy_networks(trusted_proxy_ips)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in {"http", "websocket"} or not self.trusted_networks:
            await self.app(scope, receive, send)
            return

        client_addr = scope.get("client")
        peer_ip = parse_ip(client_addr[0]) if client_addr is not None else None
        if peer_ip is None or not is_trusted_proxy(peer_ip, self.trusted_networks):
            await self.app(scope, receive, send)
            return

        headers = dict(scope["headers"])

        forwarded_proto = headers.get(b"x-forwarded-proto")
        if forwarded_proto is not None:
            resolved_proto = forwarded_proto.decode("latin-1").split(",")[0].strip().lower()
            if scope["type"] == "websocket":
                if resolved_proto == "https":
                    scope["scheme"] = "wss"
                elif resolved_proto == "http":
                    scope["scheme"] = "ws"
            elif resolved_proto in {"http", "https"}:
                scope["scheme"] = resolved_proto

        forwarded_for = headers.get(b"x-forwarded-for")
        if forwarded_for is not None:
            resolved_client = resolve_forwarded_client_ip(
                forwarded_for.decode("latin-1"),
                trusted_networks=self.trusted_networks,
            )
            if resolved_client is not None:
                scope["client"] = (resolved_client, 0)
        else:
            real_ip = headers.get(b"x-real-ip")
            if real_ip is not None:
                parsed_real_ip = parse_ip(real_ip.decode("latin-1"))
                if parsed_real_ip is not None:
                    scope["client"] = (parsed_real_ip, 0)

        await self.app(scope, receive, send)
