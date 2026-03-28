"""FastAPI application entrypoint."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.admin.router import router as admin_router
from app.core.config import get_settings
from app.core.database import get_session_maker
from app.core.sentry import init_sentry
from app.features.auth.api import router as auth_router
from app.features.customers.api import router as customer_router
from app.features.profile.api import router as profile_router
from app.features.quotes.api import public_router as quote_public_router
from app.features.quotes.api import router as quote_router
from app.shared.event_logger import configure_event_logging
from app.shared.rate_limit import limiter


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    init_sentry(dsn=settings.sentry_dsn, environment=settings.environment)
    configure_event_logging(session_factory=get_session_maker())

    app = FastAPI(title="Stima API")
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(auth_router, prefix="/api")
    app.include_router(profile_router, prefix="/api")
    app.include_router(customer_router, prefix="/api")
    app.include_router(quote_router, prefix="/api")
    app.include_router(quote_public_router)
    if settings.admin_api_key is not None:
        app.include_router(admin_router, prefix="/api")

    @app.get("/health", include_in_schema=False)
    async def health() -> JSONResponse:
        return JSONResponse({"status": "ok"})

    return app


app = create_app()
