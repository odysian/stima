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
    ExtractionSuggestion,
    LineItemExtractedV2,
    PricingHints,
    QuoteCreateRequest,
    UnresolvedSegment,
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
        self.last_create_kwargs: dict[str, object] | None = None

    async def customer_exists_for_user(self, *, user_id: UUID, customer_id: UUID) -> bool:
        del user_id
        del customer_id
        return self._customer_exists

    async def create(self, **kwargs):  # noqa: ANN003, ANN201
        self.create_calls += 1
        self.last_create_kwargs = kwargs
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
            LineItemExtractedV2(
                raw_text="mulch the front beds",
                description="Brown mulch",
                details="5 yards",
                price=120,
                confidence="medium",
            )
        ],
        pricing_hints=PricingHints(explicit_total=120),
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


async def test_create_extracted_draft_prefers_line_item_subtotal_over_conflicting_total() -> None:
    repository = _CreationRepository()
    service = QuoteCreationService(
        repository=cast(QuoteCreationRepositoryProtocol, repository),
    )
    extraction_result = ExtractionResult(
        transcript="Mulch 120 and cleanup included, total 140",
        line_items=[
            LineItemExtractedV2(
                raw_text="Mulch 120",
                description="Mulch",
                details="5 yards",
                price=120,
                confidence="medium",
            ),
            LineItemExtractedV2(
                raw_text="Cleanup included",
                description="Cleanup",
                details="Included / no charge",
                price=None,
                confidence="medium",
            ),
        ],
        pricing_hints=PricingHints(explicit_total=140),
    )

    quote = await service.create_extracted_draft(
        user_id=uuid4(),
        customer_id=None,
        extraction_result=extraction_result,
        source_type="text",
        commit=False,
    )

    assert quote.id is not None  # nosec B101 - pytest assertion
    assert repository.last_create_kwargs is not None  # nosec B101 - pytest assertion
    assert repository.last_create_kwargs["total_amount"] == 120.0  # nosec B101 - pytest assertion
    review_metadata = repository.last_create_kwargs["extraction_review_metadata"]
    assert isinstance(review_metadata, dict)  # nosec B101 - pytest assertion
    hidden_items = review_metadata["hidden_details"]["items"]  # type: ignore[index]
    assert any(
        item["kind"] == "unresolved_segment" and "total 140" in item["text"].lower()
        for item in hidden_items
    )  # nosec B101 - pytest assertion


async def test_create_extracted_draft_does_not_seed_redundant_notes_from_visible_scope() -> None:
    repository = _CreationRepository()
    service = QuoteCreationService(
        repository=cast(QuoteCreationRepositoryProtocol, repository),
    )
    extraction_result = ExtractionResult(
        transcript="trim 6 shrubs - 120 and edge front beds - 80",
        line_items=[
            LineItemExtractedV2(
                raw_text="trim 6 shrubs - 120",
                description="Trim shrubs",
                details="6 shrubs",
                price=120,
                confidence="medium",
            ),
            LineItemExtractedV2(
                raw_text="edge front beds - 80",
                description="Edge front beds",
                details=None,
                price=80,
                confidence="medium",
            ),
        ],
        pricing_hints=PricingHints(explicit_total=200),
        customer_notes_suggestion=ExtractionSuggestion(
            text="Trim shrubs and edge front beds.",
            confidence="medium",
            source="leftover_classification",
        ),
    )

    quote = await service.create_extracted_draft(
        user_id=uuid4(),
        customer_id=None,
        extraction_result=extraction_result,
        source_type="text",
        commit=False,
    )

    assert quote.id is not None  # nosec B101 - pytest assertion
    assert repository.last_create_kwargs is not None  # nosec B101 - pytest assertion
    assert repository.last_create_kwargs["notes"] is None  # nosec B101 - pytest assertion
    review_metadata = repository.last_create_kwargs["extraction_review_metadata"]
    assert isinstance(review_metadata, dict)  # nosec B101 - pytest assertion
    assert (
        review_metadata["review_state"]["notes_pending"] is False  # type: ignore[index]
    )  # nosec B101 - pytest assertion
    assert (
        review_metadata["seeded_fields"]["notes"]["seeded"] is False  # type: ignore[index]
    )  # nosec B101 - pytest assertion


async def test_create_extracted_draft_avoids_duplicate_uncertainty_notes() -> None:
    repository = _CreationRepository()
    service = QuoteCreationService(
        repository=cast(QuoteCreationRepositoryProtocol, repository),
    )
    extraction_result = ExtractionResult(
        transcript="mulch 225 maybe skip edging on one side",
        line_items=[
            LineItemExtractedV2(
                raw_text="mulch 225",
                description="Mulch",
                details="5 yards",
                price=225,
                confidence="medium",
            )
        ],
        pricing_hints=PricingHints(explicit_total=225),
        customer_notes_suggestion=ExtractionSuggestion(
            text="Maybe skip edging on one side.",
            confidence="medium",
            source="leftover_classification",
        ),
        unresolved_segments=[
            UnresolvedSegment(
                raw_text="Maybe skip edging on one side.",
                confidence="medium",
                source="transcript_conflict",
            )
        ],
    )

    quote = await service.create_extracted_draft(
        user_id=uuid4(),
        customer_id=None,
        extraction_result=extraction_result,
        source_type="text",
        commit=False,
    )

    assert quote.id is not None  # nosec B101 - pytest assertion
    assert repository.last_create_kwargs is not None  # nosec B101 - pytest assertion
    assert repository.last_create_kwargs["notes"] is None  # nosec B101 - pytest assertion
    review_metadata = repository.last_create_kwargs["extraction_review_metadata"]
    assert isinstance(review_metadata, dict)  # nosec B101 - pytest assertion
    hidden_items = review_metadata["hidden_details"]["items"]  # type: ignore[index]
    assert any("skip edging" in item["text"].lower() for item in hidden_items)


async def test_create_extracted_draft_voice_mode_does_not_seed_redundant_scope_notes() -> None:
    repository = _CreationRepository()
    service = QuoteCreationService(
        repository=cast(QuoteCreationRepositoryProtocol, repository),
    )
    extraction_result = ExtractionResult(
        transcript="install five yards of mulch at two twenty five",
        line_items=[
            LineItemExtractedV2(
                raw_text="install five yards of mulch at two twenty five",
                description="Install mulch",
                details="5 yards",
                price=225,
                confidence="medium",
            )
        ],
        pricing_hints=PricingHints(explicit_total=225),
        customer_notes_suggestion=ExtractionSuggestion(
            text="Install five yards of mulch.",
            confidence="medium",
            source="leftover_classification",
        ),
    )

    quote = await service.create_extracted_draft(
        user_id=uuid4(),
        customer_id=None,
        extraction_result=extraction_result,
        source_type="voice",
        commit=False,
    )

    assert quote.id is not None  # nosec B101 - pytest assertion
    assert repository.last_create_kwargs is not None  # nosec B101 - pytest assertion
    assert repository.last_create_kwargs["notes"] is None  # nosec B101 - pytest assertion
