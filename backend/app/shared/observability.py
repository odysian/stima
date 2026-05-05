"""Structured operational and security logging helpers."""

from __future__ import annotations

import contextvars
import hmac
import json
import logging
import re
import string
import sys
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any
from uuid import uuid4

from fastapi import Request
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.datastructures import MutableHeaders
from starlette.requests import Request as StarletteRequest
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import get_settings
from app.shared.proxy_headers import is_trusted_proxy, parse_ip, trusted_proxy_networks
from app.shared.rate_limit import get_ip_key

SECURITY_LOGGER_NAME = "stima.security"
CORRELATION_HEADER_NAME = "X-Correlation-ID"
_HANDLER_SENTINEL = "_stima_security_handler"
_SECURITY_LOGGER = logging.getLogger(SECURITY_LOGGER_NAME)
_CORRELATION_ID_MIN_LENGTH = 8
_CORRELATION_ID_MAX_LENGTH = 128
_CORRELATION_ID_ALLOWED_CHARS = frozenset(string.ascii_letters + string.digits + "-_.")
_correlation_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "stima_correlation_id",
    default=None,
)


@dataclass(frozen=True, slots=True)
class RequestLogContext:
    """Request-scoped log metadata available outside route handlers."""

    method: str
    route_template: str
    client_ip_hash: str | None


_request_context_var: contextvars.ContextVar[RequestLogContext | None] = contextvars.ContextVar(
    "stima_request_context",
    default=None,
)
_rate_limited_events: dict[str, float] = {}
_SENSITIVE_FIELD_NAMES = frozenset(
    {
        "access_token",
        "api_key",
        "auth_token",
        "authorization",
        "authorization_header",
        "connection_string",
        "cookie",
        "cookies",
        "error_message",
        "message_body",
        "model_output",
        "model_response",
        "notes",
        "prompt",
        "prompt_body",
        "prompt_text",
        "provider_api_key",
        "raw_share_token",
        "raw_token",
        "raw_tool_payload",
        "raw_transcript",
        "raw_typed_notes",
        "refresh_token",
        "response",
        "response_body",
        "response_text",
        "secret",
        "share_token",
        "spoken_money_amount",
        "spoken_money_phrase",
        "token",
        "tool_payload",
        "tool_response",
        "transcript",
        "typed_notes",
    }
)
_SENSITIVE_FIELD_SUFFIXES = (
    "_api_key",
    "_authorization",
    "_cookie",
    "_prompt",
    "_response",
    "_secret",
    "_token",
)
_SAFE_SUFFIX_EXCEPTIONS = frozenset(
    {
        "token_input_tokens",
        "token_output_tokens",
        "token_usage",
    }
)


class RequestObservabilityMiddleware:
    """Attach request correlation context and emit structured access/error logs."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = StarletteRequest(scope, receive=receive)
        correlation_id = _resolve_request_correlation_id(scope, request)
        method = request.method.upper()
        route_template = sanitize_route_template(request.url.path)
        client_ip_hash = hash_client_ip(get_ip_key(request))
        status_code: int | None = None

        scope.setdefault("state", {})
        request.state.observability_method = method
        request.state.observability_route_template = route_template
        request.state.observability_client_ip_hash = client_ip_hash

        correlation_token = _correlation_id_var.set(correlation_id)
        request_context_token = _request_context_var.set(
            RequestLogContext(
                method=method,
                route_template=route_template,
                client_ip_hash=client_ip_hash,
            )
        )

        async def send_with_correlation(message: Message) -> None:
            nonlocal status_code

            if message["type"] == "http.response.start":
                status_code = int(message["status"])
                headers = MutableHeaders(scope=message)
                headers[CORRELATION_HEADER_NAME] = correlation_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_correlation)
        except Exception:
            log_security_event(
                "http.request.failed",
                outcome="server_error",
                level=logging.ERROR,
                status_code=500,
                reason="unhandled_exception",
            )
            raise
        else:
            resolved_status = status_code or 500
            event_name = (
                "http.request.completed" if resolved_status < 500 else "http.request.failed"
            )
            level = logging.INFO if resolved_status < 500 else logging.ERROR
            log_security_event(
                event_name,
                outcome=_status_outcome(resolved_status),
                level=level,
                status_code=resolved_status,
            )
        finally:
            _request_context_var.reset(request_context_token)
            _correlation_id_var.reset(correlation_token)


def configure_security_logging() -> None:
    """Attach a stdout handler for structured security/ops log messages once."""
    _SECURITY_LOGGER.setLevel(logging.INFO)
    _SECURITY_LOGGER.propagate = False
    if any(getattr(handler, _HANDLER_SENTINEL, False) for handler in _SECURITY_LOGGER.handlers):
        return

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    setattr(handler, _HANDLER_SENTINEL, True)
    _SECURITY_LOGGER.addHandler(handler)


async def bind_request_context(request: Request) -> None:
    """Bind route-aware request metadata so services can log with request context."""
    route_template = _resolve_route_template(request)
    client_ip_hash = hash_client_ip(get_ip_key(request))
    request.state.observability_method = request.method.upper()
    request.state.observability_route_template = route_template
    request.state.observability_client_ip_hash = client_ip_hash
    _request_context_var.set(
        RequestLogContext(
            method=request.method.upper(),
            route_template=route_template,
            client_ip_hash=client_ip_hash,
        )
    )


def reset_observability_state() -> None:
    """Clear in-memory observability guardrails between isolated test runs."""
    _rate_limited_events.clear()


def bind_worker_correlation(
    *,
    job_name: str,
    job_id: str,
    correlation_id: str | None = None,
) -> contextvars.Token[str | None]:
    """Bind worker correlation context, preserving validated API ids when provided."""
    del job_name, job_id
    normalized_correlation = _normalize_correlation_id(correlation_id)
    return _correlation_id_var.set(normalized_correlation or uuid4().hex)


def suspend_request_context() -> contextvars.Token[RequestLogContext | None]:
    """Clear request context while background work executes."""
    return _request_context_var.set(None)


def reset_correlation(token: contextvars.Token[str | None]) -> None:
    """Reset the active correlation id after request/job execution."""
    _correlation_id_var.reset(token)


def reset_request_context(
    token: contextvars.Token[RequestLogContext | None] | None,
) -> None:
    """Reset the active request context after dependency cleanup."""
    if token is None:
        return
    _request_context_var.reset(token)


def current_request_context() -> RequestLogContext | None:
    """Return request metadata for the current execution context when available."""
    return _request_context_var.get()


def current_correlation_id() -> str:
    """Return the active correlation id, creating one when missing."""
    correlation_id = _correlation_id_var.get()
    if correlation_id is not None:
        return correlation_id

    generated = uuid4().hex
    _correlation_id_var.set(generated)
    return generated


def _resolve_request_correlation_id(scope: Scope, request: StarletteRequest) -> str:
    header_value = request.headers.get(CORRELATION_HEADER_NAME)
    if _is_trusted_ingress(scope):
        normalized_header = _normalize_correlation_id(header_value)
        if normalized_header is not None:
            return normalized_header
    return uuid4().hex


def _is_trusted_ingress(scope: Scope) -> bool:
    trusted_networks = trusted_proxy_networks(get_settings().trusted_proxy_ips)
    if not trusted_networks:
        return False
    client_addr = scope.get("client")
    peer_ip = parse_ip(client_addr[0]) if client_addr is not None else None
    if peer_ip is None:
        return False
    return is_trusted_proxy(peer_ip, trusted_networks)


def _normalize_correlation_id(candidate: str | None) -> str | None:
    if candidate is None:
        return None
    normalized_candidate = candidate.strip()
    if not (_CORRELATION_ID_MIN_LENGTH <= len(normalized_candidate) <= _CORRELATION_ID_MAX_LENGTH):
        return None
    if any(char not in _CORRELATION_ID_ALLOWED_CHARS for char in normalized_candidate):
        return None
    return normalized_candidate


def log_security_event(
    event: str,
    *,
    outcome: str,
    level: int = logging.INFO,
    token_ref: str | None = None,
    status_code: int | None = None,
    reason: str | None = None,
    rate_limit_key: str | None = None,
    rate_limit_seconds: float | None = None,
    **fields: Any,
) -> None:
    """Emit one structured security/operations log event."""
    if rate_limit_key and rate_limit_seconds is not None:
        if not _should_emit(rate_limit_key, rate_limit_seconds):
            return

    payload: dict[str, Any] = {
        "event": event,
        "timestamp": datetime.now(UTC).isoformat(),
        "level": logging.getLevelName(level),
        "logger": SECURITY_LOGGER_NAME,
        "correlation_id": current_correlation_id(),
        "outcome": outcome,
    }

    request_context = current_request_context()
    if request_context is not None:
        payload["method"] = request_context.method
        payload["route_template"] = request_context.route_template
        payload["client_ip_hash"] = request_context.client_ip_hash
    if status_code is not None:
        payload["status_code"] = status_code
    if reason is not None:
        payload["reason"] = reason
    if token_ref is not None:
        payload["token_ref_hash"] = hash_token_reference(token_ref)

    payload.update(sanitize_log_fields(fields))

    _emit_security_payload(payload, level=level)


def log_provider_retry(
    *,
    provider: str,
    upstream_status: int,
    attempt: int,
    max_attempts: int,
    backoff_ms: int,
    **fields: Any,
) -> None:
    """Emit a structured provider retry-cycle event."""
    log_security_event(
        "provider.retry_scheduled",
        outcome="retrying",
        level=logging.WARNING,
        provider=provider,
        upstream_status=upstream_status,
        attempt=attempt,
        max_attempts=max_attempts,
        backoff_ms=backoff_ms,
        reason="provider_retryable_error",
        **fields,
    )


def log_provider_quota_exhausted(
    *,
    provider: str,
    upstream_status: int,
    attempt: int,
    max_attempts: int,
    **fields: Any,
) -> None:
    """Emit a structured provider quota exhaustion event."""
    log_security_event(
        "provider.quota_exhausted",
        outcome="failed",
        level=logging.ERROR,
        provider=provider,
        upstream_status=upstream_status,
        attempt=attempt,
        max_attempts=max_attempts,
        backoff_ms=0,
        reason="provider_rate_limited",
        rate_limit_key=f"provider:{provider}:{upstream_status}",
        rate_limit_seconds=60,
        **fields,
    )


async def security_rate_limit_handler(
    request: Request,
    exc: RateLimitExceeded,
):
    """Emit structured auth throttle logs before returning the default 429 response."""
    route_template = _resolve_route_template(request)
    if route_template.startswith("/api/auth/"):
        log_security_event(
            "auth.throttle",
            outcome="blocked",
            level=logging.WARNING,
            status_code=429,
            reason="rate_limit_exceeded",
            rate_limit_key=f"auth-throttle:{route_template}:{hash_client_ip(get_ip_key(request))}",
            rate_limit_seconds=60,
            rate_limit=str(exc.detail),
        )
    return _rate_limit_exceeded_handler(request, exc)


def hash_token_reference(token: str) -> str:
    """Return a keyed HMAC-SHA256 reference for token-derived log context."""
    return _hmac_reference("token", token)


def hash_client_ip(client_ip: str | None) -> str | None:
    """Return a keyed HMAC-SHA256 reference for client IP values."""
    if client_ip is None:
        return None
    return _hmac_reference("client_ip", client_ip)


def sanitize_log_fields(fields: dict[str, Any]) -> dict[str, Any]:
    """Drop obviously sensitive structured log fields by key."""
    sanitized: dict[str, Any] = {}
    for key, value in fields.items():
        if value is None or is_sensitive_log_field(key):
            continue
        sanitized[key] = value
    return sanitized


def is_sensitive_log_field(field_name: str) -> bool:
    """Return True when a structured log field name should never emit raw content."""
    normalized = re.sub(r"[^a-z0-9]+", "_", field_name.strip().lower()).strip("_")
    if not normalized:
        return False
    if normalized in _SENSITIVE_FIELD_NAMES:
        return True
    if normalized in _SAFE_SUFFIX_EXCEPTIONS:
        return False
    return normalized.endswith(_SENSITIVE_FIELD_SUFFIXES)


def sanitize_route_template(path: str) -> str:
    """Redact token-bearing public routes in fallback path logging."""
    stripped_path = path.split("?", 1)[0]
    if stripped_path.startswith("/api/public/doc/"):
        suffix = stripped_path.removeprefix("/api/public/doc/")
        if suffix.endswith("/logo"):
            return "/api/public/doc/{token}/logo"
        return "/api/public/doc/{token}"
    if stripped_path.startswith("/share/"):
        return "/share/{token}"
    if stripped_path.startswith("/doc/"):
        return "/doc/{token}"
    return stripped_path


def _emit_security_payload(payload: dict[str, Any], *, level: int) -> None:
    _SECURITY_LOGGER.log(level, json.dumps(payload, default=str, sort_keys=True))


def _hmac_reference(namespace: str, value: str) -> str:
    secret_key = get_settings().secret_key.encode("utf-8")
    digest = hmac.new(
        secret_key,
        f"{namespace}:{value}".encode(),
        sha256,
    ).hexdigest()
    return digest


def _should_emit(key: str, interval_seconds: float) -> bool:
    now = time.monotonic()
    next_allowed = _rate_limited_events.get(key, 0.0)
    if next_allowed > now:
        return False

    _rate_limited_events[key] = now + interval_seconds
    expired_keys = [
        candidate for candidate, expiry in _rate_limited_events.items() if expiry <= now
    ]
    for candidate in expired_keys:
        _rate_limited_events.pop(candidate, None)
    return True


def _resolve_route_template(request: Request) -> str:
    route = request.scope.get("route")
    route_path = getattr(route, "path", None) or getattr(route, "path_format", None)
    if isinstance(route_path, str) and route_path:
        return sanitize_route_template(route_path)
    return sanitize_route_template(request.url.path)


def _status_outcome(status_code: int) -> str:
    if status_code >= 500:
        return "server_error"
    if status_code >= 400:
        return "client_error"
    return "success"
