"""Quote API behavior tests for extraction, CRUD flow, and ownership scoping."""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from typing import Annotated
from uuid import uuid4

import pytest
from fastapi import Depends
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.auth.service import CSRF_COOKIE_NAME
from app.features.quotes import api as quote_api
from app.features.quotes.repository import QuoteRenderContext, QuoteRepository
from app.features.quotes.schemas import ExtractionResult, LineItemDraft
from app.features.quotes.service import QuoteService
from app.integrations.audio import AudioClip, AudioError
from app.integrations.extraction import ExtractionError
from app.integrations.transcription import TranscriptionError
from app.main import app
from app.shared.dependencies import get_quote_service

pytestmark = pytest.mark.asyncio


class _MockExtractionIntegration:
    async def extract(self, notes: str) -> ExtractionResult:
        if "malformed" in notes.lower():
            raise ExtractionError("mock malformed extraction payload")

        normalized_notes = notes.strip()
        return ExtractionResult(
            transcript=normalized_notes,
            line_items=[
                LineItemDraft(
                    description="Brown mulch",
                    details="5 yards",
                    price=120,
                )
            ],
            total=120,
            confidence_notes=[],
        )


class _MockPdfIntegration:
    def render(self, context: QuoteRenderContext) -> bytes:
        return f"PDF for {context.doc_number}".encode()


class _MockAudioIntegration:
    def normalize_and_stitch(self, clips: Sequence[AudioClip]) -> bytes:
        if not clips:
            raise AudioError("At least one audio clip is required")

        if any(len(clip.content) == 0 for clip in clips):
            raise AudioError("Audio clip is empty")

        if any(clip.content == b"unsupported" for clip in clips):
            raise AudioError("Audio clip format is not supported or file is corrupted")

        if any(clip.content == b"trigger-transcription-error" for clip in clips):
            return b"trigger-transcription-error"

        return f"stitched-{len(clips)}".encode()


class _MockTranscriptionIntegration:
    async def transcribe(self, audio_wav: bytes) -> str:
        if audio_wav == b"trigger-transcription-error":
            raise TranscriptionError("mock transcription outage")
        return f"transcript from {audio_wav.decode()}"


@pytest.fixture(autouse=True)
def _override_quote_service_dependency() -> Iterator[None]:
    async def _override_get_quote_service(
        db: Annotated[AsyncSession, Depends(get_db)],
    ) -> QuoteService:
        return QuoteService(
            repository=QuoteRepository(db),
            extraction_integration=_MockExtractionIntegration(),
            audio_integration=_MockAudioIntegration(),
            transcription_integration=_MockTranscriptionIntegration(),
            pdf_integration=_MockPdfIntegration(),
        )

    app.dependency_overrides[get_quote_service] = _override_get_quote_service
    yield
    app.dependency_overrides.pop(get_quote_service, None)


async def test_quote_crud_happy_path_with_ordering_and_line_item_replacement(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    initial_list = await client.get("/api/quotes")
    assert initial_list.status_code == 200
    assert initial_list.json() == []

    extraction_response = await client.post(
        "/api/quotes/convert-notes",
        json={"notes": "5 yards brown mulch and edge front beds, total 120"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert extraction_response.status_code == 200
    extraction_payload = extraction_response.json()
    assert extraction_payload["transcript"]
    assert isinstance(extraction_payload["line_items"], list)
    assert extraction_payload["line_items"][0]["price"] == 120
    assert extraction_payload["confidence_notes"] == []

    create_response_1 = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": extraction_payload["transcript"],
            "line_items": extraction_payload["line_items"],
            "total_amount": extraction_payload["total"],
            "notes": "Please review within 7 days",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response_1.status_code == 201
    created_quote_1 = create_response_1.json()
    assert created_quote_1["doc_number"] == "Q-001"
    assert created_quote_1["status"] == "draft"
    assert created_quote_1["source_type"] == "text"

    create_response_2 = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "Second quote",
            "line_items": [
                {
                    "description": "Refresh garden bed",
                    "details": None,
                    "price": 75,
                }
            ],
            "total_amount": 75,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response_2.status_code == 201
    created_quote_2 = create_response_2.json()
    assert created_quote_2["doc_number"] == "Q-002"

    list_response = await client.get("/api/quotes")
    assert list_response.status_code == 200
    list_payload = list_response.json()
    assert len(list_payload) == 2
    assert list_payload[0]["id"] == created_quote_2["id"]
    assert list_payload[1]["id"] == created_quote_1["id"]

    detail_response = await client.get(f"/api/quotes/{created_quote_1['id']}")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert detail_payload["id"] == created_quote_1["id"]
    assert detail_payload["line_items"]

    patch_response = await client.patch(
        f"/api/quotes/{created_quote_1['id']}",
        json={
            "line_items": [
                {
                    "description": "Premium brown mulch",
                    "details": "6 yards",
                    "price": None,
                }
            ],
            "total_amount": 150,
            "notes": "Updated note",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    patched = patch_response.json()
    assert len(patched["line_items"]) == 1
    assert patched["line_items"][0]["description"] == "Premium brown mulch"
    assert patched["line_items"][0]["price"] is None
    assert patched["total_amount"] == 150
    assert patched["notes"] == "Updated note"


async def test_convert_notes_returns_422_for_extraction_errors(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/convert-notes",
        json={"notes": "malformed extraction response"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422
    assert response.json()["detail"].startswith("Extraction failed:")


async def test_capture_audio_single_clip_success(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[("clips", ("clip-1.webm", b"clip-a", "audio/webm"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["transcript"] == "transcript from stitched-1"
    assert payload["line_items"]
    assert payload["confidence_notes"] == []


async def test_capture_audio_multi_clip_success(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[
            ("clips", ("clip-1.webm", b"clip-a", "audio/webm")),
            ("clips", ("clip-2.webm", b"clip-b", "audio/webm")),
        ],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    assert response.json()["transcript"] == "transcript from stitched-2"


async def test_capture_audio_missing_clips_field_returns_422(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422


async def test_capture_audio_rejects_empty_clip_with_400(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[("clips", ("clip-1.webm", b"", "audio/webm"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Audio clip is empty"}


async def test_capture_audio_rejects_unsupported_clip_with_400(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[("clips", ("clip-1.webm", b"unsupported", "audio/webm"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Audio clip format is not supported or file is corrupted"}


async def test_capture_audio_rejects_oversized_clip_with_400(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(quote_api, "MAX_AUDIO_CLIP_BYTES", 4)
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[("clips", ("clip-1.webm", b"12345", "audio/webm"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Clip too large"}


async def test_capture_audio_transcription_failure_returns_502(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[("clips", ("clip-1.webm", b"trigger-transcription-error", "audio/webm"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 502
    assert response.json()["detail"].startswith("Transcription failed:")


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("get", "/api/quotes", None),
        ("get", "/api/quotes/00000000-0000-0000-0000-000000000000", None),
        ("post", "/api/quotes/convert-notes", {"notes": "notes"}),
        (
            "post",
            "/api/quotes",
            {
                "customer_id": "00000000-0000-0000-0000-000000000000",
                "transcript": "notes",
                "line_items": [{"description": "x", "details": None, "price": None}],
                "total_amount": None,
                "notes": None,
                "source_type": "text",
            },
        ),
        (
            "patch",
            "/api/quotes/00000000-0000-0000-0000-000000000000",
            {"notes": "updated"},
        ),
        ("post", "/api/quotes/00000000-0000-0000-0000-000000000000/pdf", None),
        ("post", "/api/quotes/00000000-0000-0000-0000-000000000000/share", None),
    ],
)
async def test_all_quote_endpoints_require_authentication(
    client: AsyncClient,
    method: str,
    path: str,
    payload: dict[str, object] | None,
) -> None:
    client.cookies.clear()
    client.cookies.set(CSRF_COOKIE_NAME, "csrf", path="/")

    headers = {"X-CSRF-Token": "csrf"}
    request_method = getattr(client, method)
    if payload is None:
        response = await request_method(path, headers=headers)
    else:
        response = await request_method(path, json=payload, headers=headers)

    assert response.status_code == 401


async def test_capture_audio_requires_authentication(client: AsyncClient) -> None:
    client.cookies.clear()
    client.cookies.set(CSRF_COOKIE_NAME, "csrf", path="/")

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[("clips", ("clip-1.webm", b"clip-a", "audio/webm"))],
        headers={"X-CSRF-Token": "csrf"},
    )

    assert response.status_code == 401


async def test_convert_notes_requires_csrf(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/convert-notes",
        json={"notes": "mulch and edging"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_capture_audio_requires_csrf(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[("clips", ("clip-1.webm", b"clip-a", "audio/webm"))],
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_create_quote_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": None}],
            "total_amount": None,
            "notes": None,
            "source_type": "text",
        },
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_patch_quote_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": None}],
            "total_amount": None,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]

    response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"notes": "updated"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_create_quote_returns_404_for_different_users_customer(
    client: AsyncClient,
) -> None:
    csrf_token_user_a = await _register_and_login(client, _credentials())
    customer_id_user_a = await _create_customer(client, csrf_token_user_a)

    csrf_token_user_b = await _register_and_login(client, _credentials())
    response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id_user_a,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token_user_b},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_get_quote_returns_404_for_different_users_quote(client: AsyncClient) -> None:
    csrf_token_user_a = await _register_and_login(client, _credentials())
    customer_id_user_a = await _create_customer(client, csrf_token_user_a)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id_user_a,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token_user_a},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]

    await _register_and_login(client, _credentials())
    response = await client.get(f"/api/quotes/{quote_id}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_patch_quote_returns_404_for_different_users_quote(client: AsyncClient) -> None:
    csrf_token_user_a = await _register_and_login(client, _credentials())
    customer_id_user_a = await _create_customer(client, csrf_token_user_a)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id_user_a,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token_user_a},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]

    csrf_token_user_b = await _register_and_login(client, _credentials())
    response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"notes": "hijacked"},
        headers={"X-CSRF-Token": csrf_token_user_b},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_create_quote_persists_voice_source_type(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "transcript from stitched-1",
            "line_items": [{"description": "Line item", "details": None, "price": 35}],
            "total_amount": 35,
            "notes": None,
            "source_type": "voice",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 201
    assert response.json()["source_type"] == "voice"


async def _register_and_login(client: AsyncClient, credentials: dict[str, str]) -> str:
    register_response = await client.post("/api/auth/register", json=credentials)
    assert register_response.status_code == 201
    login_response = await client.post("/api/auth/login", json=credentials)
    assert login_response.status_code == 200
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None
    return csrf_token


async def _create_customer(client: AsyncClient, csrf_token: str) -> str:
    response = await client.post(
        "/api/customers",
        json={"name": "Quote Test Customer"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 201
    return response.json()["id"]


def _credentials() -> dict[str, str]:
    suffix = uuid4().hex[:12]
    return {
        "email": f"user-{suffix}@example.com",
        "password": "StrongPass123!",
    }
