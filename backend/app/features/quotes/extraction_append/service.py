"""Quote extraction append lifecycle service."""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable, Sequence
from typing import Protocol
from uuid import UUID

from app.features.quotes.errors import QuoteServiceError
from app.features.quotes.extraction_outcomes import classify_extraction_result
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.schemas import ExtractionResult, LineItemDraft
from app.shared.pricing import (
    PricingValidationError,
    derive_document_subtotal_from_line_items,
    document_field_float_or_none,
    resolve_document_subtotal_for_edit,
    validate_document_pricing_input,
)

_APPENDABLE_QUOTE_STATUSES = frozenset(
    {
        QuoteStatus.DRAFT,
        QuoteStatus.READY,
        QuoteStatus.SHARED,
        QuoteStatus.VIEWED,
        QuoteStatus.APPROVED,
        QuoteStatus.DECLINED,
    }
)
_APPEND_UNAVAILABLE_DETAIL = "This quote can no longer be edited."
_APPEND_TRANSCRIPT_SEPARATOR_PATTERN = re.compile(r"(?:^|\n\n)Added later(?: \(\d+\))?:\n")
_APPEND_TRANSCRIPT_BULLET_PREFIXES = ("- ", "* ")


class QuoteExtractionAppendRepositoryProtocol(Protocol):
    """Repository behavior required by extraction append lifecycle orchestration."""

    async def get_by_id(self, quote_id: UUID, user_id: UUID) -> Document | None: ...

    async def append_extraction(
        self,
        *,
        document: Document,
        transcript: str,
        total_amount: float | None,
        line_items: list[LineItemDraft],
        extraction_tier: str | None = None,
        extraction_degraded_reason_code: str | None = None,
    ) -> Document: ...

    async def invalidate_pdf_artifact(self, document: Document) -> str | None: ...

    async def commit(self) -> None: ...

    async def refresh(self, document: Document) -> Document: ...


class QuoteExtractionAppendService:
    """Own extraction append lifecycle behavior for existing quotes."""

    def __init__(
        self,
        *,
        repository: QuoteExtractionAppendRepositoryProtocol,
        delete_obsolete_artifact: Callable[[str | None], Awaitable[None]],
    ) -> None:
        self._repository = repository
        self._delete_obsolete_artifact = delete_obsolete_artifact

    async def ensure_quote_appendable(
        self,
        *,
        user_id: UUID,
        quote_id: UUID,
    ) -> Document:
        """Return one owned quote that can accept append extraction updates."""
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if quote.status not in _APPENDABLE_QUOTE_STATUSES:
            raise QuoteServiceError(detail=_APPEND_UNAVAILABLE_DETAIL, status_code=409)
        return quote

    async def append_extraction_to_quote(
        self,
        *,
        user_id: UUID,
        quote_id: UUID,
        extraction_result: ExtractionResult,
        commit: bool = True,
    ) -> tuple[Document, ExtractionResult]:
        """Append extraction output and commit cleanup only when `commit=True`."""
        quote = await self.ensure_quote_appendable(user_id=user_id, quote_id=quote_id)
        appended_line_items = [
            LineItemDraft(
                description=item.description,
                details=item.details,
                price=item.price,
            )
            for item in extraction_result.line_items
        ]
        merged_line_items = [
            *[
                LineItemDraft(
                    description=line_item.description,
                    details=line_item.details,
                    price=document_field_float_or_none(line_item.price),
                )
                for line_item in quote.line_items
            ],
            *appended_line_items,
        ]
        line_items_define_subtotal, derived_line_item_subtotal = (
            derive_document_subtotal_from_line_items(merged_line_items)
        )
        current_subtotal = resolve_document_subtotal_for_edit(
            total_amount=quote.total_amount,
            discount_type=quote.discount_type,
            discount_value=quote.discount_value,
            tax_rate=quote.tax_rate,
            deposit_amount=quote.deposit_amount,
            line_items=merged_line_items,
        )
        validated_pricing = _validate_document_pricing_for_append(
            total_amount=(
                derived_line_item_subtotal if line_items_define_subtotal else current_subtotal
            ),
            line_items=merged_line_items,
            discount_type=quote.discount_type,
            discount_value=document_field_float_or_none(quote.discount_value),
            tax_rate=document_field_float_or_none(quote.tax_rate),
            deposit_amount=document_field_float_or_none(quote.deposit_amount),
        )

        next_transcript = _merge_append_transcript(
            current_transcript=quote.transcript,
            appended_transcript=extraction_result.transcript,
        )
        extraction_metadata = classify_extraction_result(extraction_result)
        updated_quote = await self._repository.append_extraction(
            document=quote,
            transcript=next_transcript,
            total_amount=document_field_float_or_none(validated_pricing.total_amount),
            line_items=appended_line_items,
            extraction_tier=extraction_metadata.tier,
            extraction_degraded_reason_code=extraction_metadata.degraded_reason_code,
        )
        obsolete_artifact_path = await self._repository.invalidate_pdf_artifact(updated_quote)
        if not commit:
            return updated_quote, extraction_result

        await self._repository.commit()
        await self._delete_obsolete_artifact(obsolete_artifact_path)
        return await self._repository.refresh(updated_quote), extraction_result


def _validate_document_pricing_for_append(
    *,
    total_amount: float | None,
    line_items: Sequence[object] | None,
    discount_type: str | None,
    discount_value: float | None,
    tax_rate: float | None,
    deposit_amount: float | None,
):
    try:
        return validate_document_pricing_input(
            total_amount=total_amount,
            line_items=line_items,
            discount_type=discount_type,
            discount_value=discount_value,
            tax_rate=tax_rate,
            deposit_amount=deposit_amount,
        )
    except PricingValidationError as exc:
        raise QuoteServiceError(detail=str(exc), status_code=422) from exc


def _merge_append_transcript(*, current_transcript: str, appended_transcript: str) -> str:
    normalized_current = current_transcript.rstrip()
    appended_entries = _extract_append_entries(appended_transcript)

    if not normalized_current:
        if not appended_entries:
            return ""
        return "Added later:\n" + "\n".join(f"- {entry}" for entry in appended_entries)

    base_transcript, existing_entries = _split_transcript_and_append_entries(normalized_current)
    merged_entries = [*existing_entries, *appended_entries]
    if not merged_entries:
        return base_transcript

    append_section = "Added later:\n" + "\n".join(f"- {entry}" for entry in merged_entries)
    if not base_transcript:
        return append_section
    return f"{base_transcript}\n\n{append_section}"


def _split_transcript_and_append_entries(current_transcript: str) -> tuple[str, list[str]]:
    matches = list(_APPEND_TRANSCRIPT_SEPARATOR_PATTERN.finditer(current_transcript))
    if not matches:
        return current_transcript, []

    base_transcript = current_transcript[: matches[0].start()].rstrip()
    entries: list[str] = []
    for index, match in enumerate(matches):
        body_start = match.end()
        body_end = (
            matches[index + 1].start() if index + 1 < len(matches) else len(current_transcript)
        )
        section_body = current_transcript[body_start:body_end]
        entries.extend(_extract_append_entries(section_body))

    return base_transcript, entries


def _extract_append_entries(transcript: str) -> list[str]:
    entries: list[str] = []
    for raw_line in transcript.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        for prefix in _APPEND_TRANSCRIPT_BULLET_PREFIXES:
            if line.startswith(prefix):
                line = line[len(prefix) :].strip()
                break
        if line:
            entries.append(line)
    return entries
