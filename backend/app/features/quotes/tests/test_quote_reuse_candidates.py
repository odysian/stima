"""Quote reuse candidates API behavior tests."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.quotes.models import QuoteStatus
from app.features.quotes.tests import test_quotes as quotes_test_module
from app.features.quotes.tests.support.helpers import (
    _create_customer,
    _credentials,
    _register_and_login,
    _set_quote_status,
)

pytestmark = pytest.mark.asyncio

# Reuse existing fixture wiring/helpers from test_quotes to preserve behavior.
_reset_email_delivery_fallback_cache = quotes_test_module._reset_email_delivery_fallback_cache
_override_storage_service_dependency = quotes_test_module._override_storage_service_dependency
_override_quote_service_dependency = quotes_test_module._override_quote_service_dependency
_override_extraction_service_dependency = quotes_test_module._override_extraction_service_dependency
_reset_rate_limiter = quotes_test_module._reset_rate_limiter


async def _create_quote_with_line_items(
    client: AsyncClient,
    csrf_token: str,
    *,
    customer_id: str,
    title: str | None,
    line_items: list[dict[str, Any]],
    total_amount: float | None,
) -> dict[str, Any]:
    response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "title": title,
            "transcript": f"{title or 'Reusable quote'} transcript",
            "line_items": line_items,
            "total_amount": total_amount,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 201
    return response.json()


async def _create_manual_draft(
    client: AsyncClient,
    csrf_token: str,
) -> dict[str, Any]:
    response = await client.post(
        "/api/quotes/manual-draft",
        json={},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 201
    return response.json()


async def test_reuse_candidates_return_capped_previews_and_keep_quote_list_contract(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token, name="Evergreen Landscaping")

    reusable_quote = await _create_quote_with_line_items(
        client,
        csrf_token,
        customer_id=customer_id,
        title="Backyard Refresh",
        line_items=[
            {"description": "Design plan", "details": None, "price": 120},
            {"description": "Material staging", "details": None, "price": 240},
            {"description": "Install edging", "details": None, "price": 310},
            {"description": "Final cleanup", "details": None, "price": 80},
        ],
        total_amount=750,
    )
    await _set_quote_status(db_session, reusable_quote["id"], QuoteStatus.SHARED)

    unassigned_draft = await _create_manual_draft(client, csrf_token)
    unassigned_patch_response = await client.patch(
        f"/api/quotes/{unassigned_draft['id']}",
        json={
            "title": "Unassigned follow-up",
            "line_items": [
                {"description": "Soil testing", "details": None, "price": 95},
                {"description": "Drainage check", "details": None, "price": None},
            ],
            "total_amount": 95,
            "notes": None,
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert unassigned_patch_response.status_code == 200
    unassigned_payload = unassigned_patch_response.json()

    deleted_quote = await _create_quote_with_line_items(
        client,
        csrf_token,
        customer_id=customer_id,
        title="Delete me",
        line_items=[{"description": "Cleanup", "details": None, "price": 50}],
        total_amount=50,
    )
    deleted_response = await client.delete(
        f"/api/quotes/{deleted_quote['id']}",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert deleted_response.status_code == 204

    reuse_response = await client.get("/api/quotes/reuse-candidates")
    assert reuse_response.status_code == 200
    reuse_payload = reuse_response.json()

    assert [candidate["id"] for candidate in reuse_payload] == [
        unassigned_payload["id"],
        reusable_quote["id"],
    ]

    by_id = {candidate["id"]: candidate for candidate in reuse_payload}

    reusable_candidate = by_id[reusable_quote["id"]]
    assert reusable_candidate["status"] == "shared"
    assert reusable_candidate["line_item_previews"] == [
        {"description": "Design plan", "price": 120},
        {"description": "Material staging", "price": 240},
        {"description": "Install edging", "price": 310},
    ]
    assert reusable_candidate["line_item_count"] == 4
    assert reusable_candidate["more_line_item_count"] == 1

    unassigned_candidate = by_id[unassigned_payload["id"]]
    assert unassigned_candidate["status"] == "draft"
    assert unassigned_candidate["customer_id"] is None
    assert unassigned_candidate["customer_name"] is None
    assert unassigned_candidate["line_item_previews"] == [
        {"description": "Soil testing", "price": 95},
        {"description": "Drainage check", "price": None},
    ]
    assert unassigned_candidate["line_item_count"] == 2
    assert unassigned_candidate["more_line_item_count"] == 0

    list_response = await client.get("/api/quotes")
    assert list_response.status_code == 200
    for item in list_response.json():
        assert "line_items" not in item


async def test_reuse_candidates_can_filter_by_customer_id(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_a_id = await _create_customer(client, csrf_token, name="Customer A")
    customer_b_id = await _create_customer(client, csrf_token, name="Customer B")

    quote_a = await _create_quote_with_line_items(
        client,
        csrf_token,
        customer_id=customer_a_id,
        title="Customer A Quote",
        line_items=[{"description": "Mulch", "details": None, "price": 180}],
        total_amount=180,
    )
    await _create_quote_with_line_items(
        client,
        csrf_token,
        customer_id=customer_b_id,
        title="Customer B Quote",
        line_items=[{"description": "Stone", "details": None, "price": 220}],
        total_amount=220,
    )

    response = await client.get(
        "/api/quotes/reuse-candidates",
        params={"customer_id": customer_a_id},
    )
    assert response.status_code == 200
    payload = response.json()
    assert [candidate["id"] for candidate in payload] == [quote_a["id"]]
    assert payload[0]["customer_id"] == customer_a_id
    assert payload[0]["customer_name"] == "Customer A"


async def test_reuse_candidates_query_matches_customer_title_and_doc_number(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    evergreen_customer_id = await _create_customer(
        client,
        csrf_token,
        name="Evergreen Holdings",
    )
    summit_customer_id = await _create_customer(
        client,
        csrf_token,
        name="Summit Builders",
    )

    evergreen_quote = await _create_quote_with_line_items(
        client,
        csrf_token,
        customer_id=evergreen_customer_id,
        title="Deck Rebuild Phase 1",
        line_items=[{"description": "Demo", "details": None, "price": 600}],
        total_amount=600,
    )
    summit_quote = await _create_quote_with_line_items(
        client,
        csrf_token,
        customer_id=summit_customer_id,
        title="Fence Repair",
        line_items=[{"description": "Repair", "details": None, "price": 300}],
        total_amount=300,
    )

    by_customer_name = await client.get(
        "/api/quotes/reuse-candidates",
        params={"q": "evergreen"},
    )
    assert by_customer_name.status_code == 200
    assert [candidate["id"] for candidate in by_customer_name.json()] == [evergreen_quote["id"]]

    by_title = await client.get(
        "/api/quotes/reuse-candidates",
        params={"q": "  rebuild phase 1  "},
    )
    assert by_title.status_code == 200
    assert [candidate["id"] for candidate in by_title.json()] == [evergreen_quote["id"]]

    by_doc_number = await client.get(
        "/api/quotes/reuse-candidates",
        params={"q": summit_quote["doc_number"].lower()},
    )
    assert by_doc_number.status_code == 200
    assert [candidate["id"] for candidate in by_doc_number.json()] == [summit_quote["id"]]
