"""Feature model registry for metadata discovery (e.g., Alembic autogenerate)."""

from __future__ import annotations

from app.features.auth import models as auth_models  # noqa: F401
from app.features.customers import models as customer_models  # noqa: F401
from app.features.quotes import models as quote_models  # noqa: F401
