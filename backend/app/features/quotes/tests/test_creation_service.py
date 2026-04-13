"""Quote creation slice unit tests."""

from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from app.features.quotes.creation.service import (
    QuoteCreationRepositoryProtocol,
    QuoteCreationService,
)
from app.features.quotes.models import Document
from app.features.quotes.schemas import (
    ExtractionResult,
    LineItemExtracted,
    QuoteCreateRequest,
)

pytestmark = pytest.mark.asyncio


class _CreationRepository:
    def __init__(
        self,
        *,
        customer_exists: bool = True,
        sequence_collision_on_first_create: bool = False,
    ) -> None:
        self._customer_exists = customer_exists
        self._sequence_collision_on_first_create = sequence_collision_on_first_create
        self.create_calls = 0
        self.rollback_calls = 0
        self.commit_calls = 0

    async def customer_exists_for_user(self, *, user_id: UUID, customer_id: UUID) -> bool:
        del user_id
        del customer_id
        return self._customer_exists

    async def create(self, **kwargs):  # noqa: ANN003, ANN201
        self.create_calls += 1
        if self._sequence_collision_on_first_create and self.create_calls == 1:
            raise IntegrityError(
                statement="INSERT INTO documents (...) VALUES (...)",
                params={},
                orig=Exception(
                    "duplicate key value violates unique constraint "
                    '"uq_documents_user_type_sequence"'
                ),
            )

        return cast(
            Document,
            SimpleNamespace(
                id=uuid4(),
                customer_id=kwargs["customer_id"],
                transcript=kwargs["transcript"],
            ),
        )

    async def commit(self) -> None:
        self.commit_calls += 1

    async def rollback(self) -> None:
        self.rollback_calls += 1


async def test_create_quote_document_retries_on_sequence_collision() -> None:
    repository = _CreationRepository(sequence_collision_on_first_create=True)
    service = QuoteCreationService(
        repository=cast(QuoteCreationRepositoryProtocol, repository),
    )
    request = QuoteCreateRequest(
        customer_id=uuid4(),
        transcript="quote transcript",
        line_items=[],
        total_amount=None,
        notes="Draft quote",
        source_type="text",
    )

    quote = await service.create_quote(user_id=uuid4(), data=request)

    assert quote.id is not None  # nosec B101 - pytest assertion
    assert repository.create_calls == 2  # nosec B101 - pytest assertion
    assert repository.rollback_calls == 1  # nosec B101 - pytest assertion
    assert repository.commit_calls == 1  # nosec B101 - pytest assertion


async def test_create_extracted_draft_commit_false_skips_commit() -> None:
    repository = _CreationRepository()
    service = QuoteCreationService(
        repository=cast(QuoteCreationRepositoryProtocol, repository),
    )
    extraction_result = ExtractionResult(
        transcript="mulch the front beds",
        line_items=[
            LineItemExtracted(
                description="Brown mulch",
                details="5 yards",
                price=120,
            )
        ],
        total=120,
        confidence_notes=[],
    )

    quote = await service.create_extracted_draft(
        user_id=uuid4(),
        customer_id=None,
        extraction_result=extraction_result,
        source_type="text",
        commit=False,
    )

    assert quote.id is not None  # nosec B101 - pytest assertion
    assert repository.create_calls == 1  # nosec B101 - pytest assertion
    assert repository.commit_calls == 0  # nosec B101 - pytest assertion
