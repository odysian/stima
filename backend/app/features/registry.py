"""Feature model registry for metadata discovery (e.g., Alembic autogenerate)."""

from __future__ import annotations

from app.features.auth import models as auth_models  # noqa: F401
from app.features.customers import models as customer_models  # noqa: F401
from app.features.event_logs import models as event_log_models  # noqa: F401
from app.features.jobs import models as job_models  # noqa: F401
from app.features.line_item_catalog import models as line_item_catalog_models  # noqa: F401
from app.features.quotes import models as quote_models  # noqa: F401
