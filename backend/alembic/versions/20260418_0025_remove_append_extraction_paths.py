"""Remove append-extraction artifacts and normalize legacy review metadata.

Revision ID: 20260418_0025
Revises: 20260416_0024
Create Date: 2026-04-18
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260418_0025"
down_revision: str | None = "20260416_0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_APPEND_STORAGE_TABLES = (
    "quote_append_audio_artifacts",
    "quote_append_transcript_artifacts",
    "quote_append_artifacts",
)
_APPEND_STORAGE_COLUMNS = (
    ("documents", "append_audio_artifact_path"),
    ("documents", "append_transcript_artifact_path"),
    ("documents", "append_audio_path"),
    ("documents", "append_transcript_path"),
)


def _normalize_review_metadata(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return value if value is None else None

    payload = dict(value)
    hidden_details = payload.get("hidden_details")
    if isinstance(hidden_details, dict):
        normalized_hidden_details = dict(hidden_details)
        items = normalized_hidden_details.get("items")
        if isinstance(items, list):
            filtered_items: list[dict[str, Any]] = []
            for item in items:
                if not isinstance(item, dict):
                    continue
                if item.get("kind") == "append_suggestion":
                    continue
                filtered_items.append(dict(item))
            normalized_hidden_details["items"] = filtered_items
            current_ids = {
                item.get("id") for item in filtered_items if isinstance(item.get("id"), str)
            }

            hidden_detail_state = payload.get("hidden_detail_state")
            if isinstance(hidden_detail_state, dict):
                payload["hidden_detail_state"] = {
                    item_id: state
                    for item_id, state in hidden_detail_state.items()
                    if isinstance(item_id, str) and item_id in current_ids
                }
        normalized_hidden_details.pop("append_suggestions", None)
        payload["hidden_details"] = normalized_hidden_details

    payload.pop("append_suggestions", None)
    return payload


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # Remove append-only sidecar item kind and legacy append_suggestions payloads.
    rows = bind.execute(
        sa.text(
            """
            SELECT id, extraction_review_metadata
            FROM documents
            WHERE extraction_review_metadata IS NOT NULL
            """
        )
    ).mappings()
    for row in rows:
        normalized = _normalize_review_metadata(row["extraction_review_metadata"])
        if normalized == row["extraction_review_metadata"]:
            continue
        bind.execute(
            sa.text(
                """
                UPDATE documents
                SET extraction_review_metadata = :metadata
                WHERE id = :document_id
                """
            ).bindparams(
                sa.bindparam("metadata", type_=postgresql.JSONB),
                sa.bindparam("document_id", type_=postgresql.UUID(as_uuid=True)),
            ),
            {
                "metadata": normalized,
                "document_id": row["id"],
            },
        )

    # Clear append-only degraded reason codes if any legacy data still exists.
    bind.execute(
        sa.text(
            """
            UPDATE documents
            SET extraction_degraded_reason_code = NULL
            WHERE extraction_degraded_reason_code LIKE 'append_%'
            """
        )
    )

    # Audit and remove append-specific storage tables/columns when present.
    existing_tables = set(inspector.get_table_names())
    for table_name in _APPEND_STORAGE_TABLES:
        if table_name in existing_tables:
            op.drop_table(table_name)

    table_columns: dict[str, set[str]] = {}
    for table_name, column_name in _APPEND_STORAGE_COLUMNS:
        if table_name not in table_columns:
            table_columns[table_name] = {
                column["name"] for column in inspector.get_columns(table_name)
            }
        if column_name in table_columns[table_name]:
            op.drop_column(table_name, column_name)


def downgrade() -> None:
    # This cleanup migration is intentionally not reversible.
    pass
