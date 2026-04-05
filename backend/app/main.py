"""FastAPI application entrypoint."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from arq.connections import ArqRedis, create_pool
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.datastructures import MutableHeaders
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.admin.router import router as admin_router
from app.core.config import get_settings
from app.core.database import get_session_maker
from app.core.sentry import init_sentry
from app.features.auth.api import router as auth_router
from app.features.customers.api import router as customer_router
from app.features.invoices.api import router as invoice_router
from app.features.jobs.api import router as jobs_router
from app.features.profile.api import router as profile_router
from app.features.quotes.api import public_router as quote_public_router
from app.features.quotes.api import router as quote_router
from app.shared.dependencies import get_idempotency_store
from app.shared.event_logger import configure_event_logging
from app.shared.proxy_headers import TrustedProxyHeadersMiddleware
from app.shared.rate_limit import extraction_controls, limiter
from app.worker.runtime import build_arq_redis_settings


class SecurityHeadersMiddleware:
    """Apply baseline security headers to backend-served HTTP responses."""

    def __init__(self, app: ASGIApp, *, environment: str) -> None:
        self.app = app
        self.environment = environment.lower()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_security_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("X-Content-Type-Options", "nosniff")
                headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
                headers.setdefault("X-Frame-Options", "DENY")
                if self.environment == "production" and scope.get("scheme") == "https":
                    headers.setdefault(
                        "Strict-Transport-Security",
                        "max-age=63072000; includeSubDomains",
                    )
            await send(message)

        await self.app(scope, receive, send_with_security_headers)


def _resolve_allowed_hosts(allowed_hosts: list[str]) -> list[str]:
    if not allowed_hosts or "*" in allowed_hosts:
        return ["*"]
    return allowed_hosts


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    arq_pool: ArqRedis | None = None
    if settings.redis_url is not None:
        arq_pool = await create_pool(build_arq_redis_settings(settings))
    app.state.arq_pool = arq_pool
    yield
    if arq_pool is not None:
        await arq_pool.aclose()
    if get_idempotency_store.cache_info().currsize:
        await get_idempotency_store().aclose()
    await extraction_controls.aclose()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    init_sentry(dsn=settings.sentry_dsn, environment=settings.environment)
    configure_event_logging(session_factory=get_session_maker())

    app = FastAPI(title="Stima API", lifespan=_lifespan)
    app.state.limiter = limiter
    app.state.arq_pool = None
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    if settings.enable_https_redirect:
        app.add_middleware(HTTPSRedirectMiddleware)
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=_resolve_allowed_hosts(settings.allowed_hosts),
    )
    app.add_middleware(
        SecurityHeadersMiddleware,
        environment=settings.environment,
    )
    app.add_middleware(
        TrustedProxyHeadersMiddleware,
        trusted_proxy_ips=settings.trusted_proxy_ips,
    )
    app.include_router(auth_router, prefix="/api")
    app.include_router(profile_router, prefix="/api")
    app.include_router(customer_router, prefix="/api")
    app.include_router(invoice_router, prefix="/api")
    app.include_router(jobs_router, prefix="/api")
    app.include_router(quote_router, prefix="/api")
    app.include_router(quote_public_router)
    if settings.admin_api_key is not None:
        app.include_router(admin_router, prefix="/api")

    @app.get("/health", include_in_schema=False)
    async def health() -> JSONResponse:
        return JSONResponse({"status": "ok"})

    return app


app = create_app()
