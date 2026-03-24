"""FastAPI application entrypoint."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import get_settings
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
    configure_event_logging()

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

    @app.get("/health", include_in_schema=False)
    async def health() -> JSONResponse:
        return JSONResponse({"status": "ok"})

    return app


app = create_app()
