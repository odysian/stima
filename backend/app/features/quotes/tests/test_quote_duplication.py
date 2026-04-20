"""Quote duplication API behavior tests."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.tests import test_quotes as quotes_test_module
from app.features.quotes.tests.support.helpers import (
    _create_customer,
    _create_quote,
    _credentials,
    _register_and_login,
)

pytestmark = pytest.mark.asyncio

# Reuse existing fixture wiring/helpers from test_quotes to preserve behavior.
_reset_email_delivery_fallback_cache = quotes_test_module._reset_email_delivery_fallback_cache
_override_storage_service_dependency = quotes_test_module._override_storage_service_dependency
_override_quote_service_dependency = quotes_test_module._override_quote_service_dependency
_override_extraction_service_dependency = quotes_test_module._override_extraction_service_dependency
_reset_rate_limiter = quotes_test_module._reset_rate_limiter


async def test_duplicate_quote_copies_fields_and_resets_state(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    extract_response = await client.post(
        "/api/quotes/extract",
        files=[
            ("clips", ("clip-1.webm", b"voice-capture", "audio/webm")),
            ("customer_id", (None, customer_id)),
        ],
        headers={"X-CSRF-Token": csrf_token},
    )
    assert extract_response.status_code == 200
    source_quote_id = extract_response.json()["quote_id"]

    patch_response = await client.patch(
        f"/api/quotes/{source_quote_id}",
        json={
            "title": "Spring Cleanup",
            "line_items": [
                {
                    "description": "Mulch install",
                    "details": "5 yards",
                    "price": 220,
                    "flagged": True,
                    "flag_reason": "Unit not confirmed",
                },
                {
                    "description": "Bed edging",
                    "details": "front and side beds",
                    "price": 55,
                    "flagged": False,
                    "flag_reason": None,
                },
            ],
            "total_amount": 260,
            "tax_rate": 0.0825,
            "discount_type": "fixed",
            "discount_value": 15,
            "deposit_amount": 50,
            "notes": "Customer asked for Friday start.",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    patched_source_payload = patch_response.json()

    source_document = await db_session.get(Document, UUID(source_quote_id))
    assert source_document is not None
    source_document.extraction_tier = "degraded"
    source_document.extraction_degraded_reason_code = "provider_timeout"
    source_document.extraction_review_metadata = {
        "review_state": {"notes_pending": True, "pricing_pending": True},
        "hidden_details": {
            "items": [
                {
                    "id": "x-1",
                    "kind": "unresolved_segment",
                    "field": None,
                    "reason": "transcript_conflict",
                    "confidence": "low",
                    "text": "Needs follow-up confirmation.",
                }
            ]
        },
    }
    source_document.pdf_artifact_path = "artifacts/source-quote.pdf"
    source_document.pdf_url = "https://example.test/source-quote.pdf"
    source_document.pdf_artifact_job_id = uuid4()
    source_document.pdf_artifact_revision = 7
    await db_session.commit()

    share_response = await client.post(
        f"/api/quotes/{source_quote_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    assert share_response.json()["status"] == "shared"
    assert share_response.json()["share_token"] is not None

    mark_won_response = await client.post(
        f"/api/quotes/{source_quote_id}/mark-won",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert mark_won_response.status_code == 200
    assert mark_won_response.json()["status"] == "approved"

    convert_response = await client.post(
        f"/api/quotes/{source_quote_id}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert convert_response.status_code == 201
    assert convert_response.json()["source_document_id"] == source_quote_id

    duplicate_response = await client.post(
        f"/api/quotes/{source_quote_id}/duplicate",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert duplicate_response.status_code == 201
    duplicate_payload = duplicate_response.json()

    assert duplicate_payload["id"] != source_quote_id
    assert duplicate_payload["doc_number"] != patched_source_payload["doc_number"]
    assert duplicate_payload["doc_number"].startswith("Q-")
    assert duplicate_payload["status"] == "draft"
    assert duplicate_payload["customer_id"] == patched_source_payload["customer_id"]
    assert duplicate_payload["title"] == patched_source_payload["title"]
    assert duplicate_payload["source_type"] == "text"
    assert duplicate_payload["transcript"] == ""
    assert duplicate_payload["total_amount"] == patched_source_payload["total_amount"]
    assert duplicate_payload["tax_rate"] == patched_source_payload["tax_rate"]
    assert duplicate_payload["discount_type"] == patched_source_payload["discount_type"]
    assert duplicate_payload["discount_value"] == patched_source_payload["discount_value"]
    assert duplicate_payload["deposit_amount"] == patched_source_payload["deposit_amount"]
    assert duplicate_payload["notes"] == patched_source_payload["notes"]
    assert duplicate_payload["shared_at"] is None
    assert duplicate_payload["share_token"] is None

    assert len(duplicate_payload["line_items"]) == len(patched_source_payload["line_items"])
    for duplicate_item, source_item in zip(
        duplicate_payload["line_items"],
        patched_source_payload["line_items"],
        strict=True,
    ):
        assert duplicate_item["id"] != source_item["id"]
        assert duplicate_item["description"] == source_item["description"]
        assert duplicate_item["details"] == source_item["details"]
        assert duplicate_item["price"] == source_item["price"]
        assert duplicate_item["flagged"] == source_item["flagged"]
        assert duplicate_item["flag_reason"] == source_item["flag_reason"]
        assert duplicate_item["sort_order"] == source_item["sort_order"]

    source_detail_response = await client.get(f"/api/quotes/{source_quote_id}")
    assert source_detail_response.status_code == 200
    source_detail = source_detail_response.json()
    assert source_detail["status"] == "approved"
    assert source_detail["source_type"] == "voice"
    assert source_detail["transcript"] != ""
    assert source_detail["share_token"] is not None
    assert source_detail["linked_invoice"] is not None
    assert source_detail["extraction_tier"] == "degraded"
    assert source_detail["extraction_degraded_reason_code"] == "provider_timeout"

    duplicate_detail_response = await client.get(f"/api/quotes/{duplicate_payload['id']}")
    assert duplicate_detail_response.status_code == 200
    duplicate_detail = duplicate_detail_response.json()
    assert duplicate_detail["status"] == "draft"
    assert duplicate_detail["source_type"] == "text"
    assert duplicate_detail["transcript"] == ""
    assert duplicate_detail["share_token"] is None
    assert duplicate_detail["has_active_share"] is False
    assert duplicate_detail["linked_invoice"] is None
    assert duplicate_detail["extraction_tier"] is None
    assert duplicate_detail["extraction_degraded_reason_code"] is None
    assert duplicate_detail["extraction_review_metadata"]["review_state"] == {
        "notes_pending": False,
        "pricing_pending": False,
    }
    assert duplicate_detail["extraction_review_metadata"]["hidden_details"] == {"items": []}

    duplicate_document = await db_session.get(Document, UUID(duplicate_payload["id"]))
    assert duplicate_document is not None
    assert duplicate_document.status == QuoteStatus.DRAFT
    assert duplicate_document.source_document_id is None
    assert duplicate_document.share_token is None
    assert duplicate_document.shared_at is None
    assert duplicate_document.pdf_url is None
    assert duplicate_document.pdf_artifact_path is None
    assert duplicate_document.pdf_artifact_job_id is None
    assert duplicate_document.pdf_artifact_revision == 0
    assert duplicate_document.extraction_tier is None
    assert duplicate_document.extraction_degraded_reason_code is None
    assert duplicate_document.extraction_review_metadata is None


async def test_duplicate_quote_rejects_missing_or_foreign_source(
    client: AsyncClient,
) -> None:
    first_user_csrf = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, first_user_csrf)
    quote = await _create_quote(client, first_user_csrf, customer_id)

    second_user_credentials = _credentials()
    second_user_credentials["email"] = "duplicate-other-user@example.com"
    second_user_csrf = await _register_and_login(client, second_user_credentials)

    foreign_quote_response = await client.post(
        f"/api/quotes/{quote['id']}/duplicate",
        headers={"X-CSRF-Token": second_user_csrf},
    )
    assert foreign_quote_response.status_code == 404
    assert foreign_quote_response.json() == {"detail": "Not found"}

    missing_quote_response = await client.post(
        f"/api/quotes/{uuid4()}/duplicate",
        headers={"X-CSRF-Token": second_user_csrf},
    )
    assert missing_quote_response.status_code == 404
    assert missing_quote_response.json() == {"detail": "Not found"}
