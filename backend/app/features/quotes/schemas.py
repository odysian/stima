"""Request/response schemas for quote extraction and quote CRUD endpoints."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.shared.input_limits import (
    AUDIO_TRANSCRIPT_MAX_CHARS,
    CONFIDENCE_NOTE_MAX_CHARS,
    CONFIDENCE_NOTES_MAX_ITEMS,
    DOCUMENT_LINE_ITEMS_MAX_ITEMS,
    DOCUMENT_NOTES_MAX_CHARS,
    DOCUMENT_TRANSCRIPT_MAX_CHARS,
    EXTRACTION_TRANSCRIPT_MAX_CHARS,
    LINE_ITEM_DESCRIPTION_MAX_CHARS,
    LINE_ITEM_DETAILS_MAX_CHARS,
    NOTE_INPUT_MAX_CHARS,
)
from app.shared.pricing import DiscountType


def _normalize_optional_title(value: object) -> object:
    """Trim optional title values and collapse blanks to null."""
    if value is None or not isinstance(value, str):
        return value
    trimmed = value.strip()
    return trimmed or None


class LineItemDraft(BaseModel):
    """Editable line item payload used for quote creation and updates."""

    description: str = Field(min_length=1, max_length=LINE_ITEM_DESCRIPTION_MAX_CHARS)
    details: str | None = Field(default=None, max_length=LINE_ITEM_DETAILS_MAX_CHARS)
    price: float | None = None
    flagged: bool = False
    flag_reason: str | None = None


class LineItemExtracted(LineItemDraft):
    """Extraction-only line item metadata used during review."""


class PreparedCaptureInput(BaseModel):
    """Structured capture input preserving typed vs voice provenance."""

    transcript: str = Field(min_length=1, max_length=EXTRACTION_TRANSCRIPT_MAX_CHARS)
    source_type: Literal["text", "voice", "voice+text"]
    raw_typed_notes: str | None = Field(default=None, max_length=NOTE_INPUT_MAX_CHARS)
    raw_transcript: str | None = Field(default=None, max_length=AUDIO_TRANSCRIPT_MAX_CHARS)

    @classmethod
    def from_legacy_transcript(
        cls,
        *,
        transcript: str,
        source_type: Literal["text", "voice"] = "text",
    ) -> PreparedCaptureInput:
        """Build structured input from legacy single-string payloads."""
        normalized_transcript = transcript.strip()
        if source_type == "voice":
            return cls(
                transcript=normalized_transcript,
                source_type="voice",
                raw_typed_notes=None,
                raw_transcript=normalized_transcript,
            )
        return cls(
            transcript=normalized_transcript,
            source_type="text",
            raw_typed_notes=normalized_transcript,
            raw_transcript=None,
        )

    @model_validator(mode="after")
    def validate_source_provenance(self) -> PreparedCaptureInput:
        """Ensure source-specific provenance fields stay coherent."""
        if self.source_type == "text":
            if self.raw_typed_notes is None:
                raise ValueError("raw_typed_notes is required for text source_type")
            if self.raw_transcript is not None:
                raise ValueError("raw_transcript must be null for text source_type")
        elif self.source_type == "voice":
            if self.raw_transcript is None:
                raise ValueError("raw_transcript is required for voice source_type")
            if self.raw_typed_notes is not None:
                raise ValueError("raw_typed_notes must be null for voice source_type")
        else:
            if self.raw_typed_notes is None or self.raw_transcript is None:
                raise ValueError(
                    "raw_typed_notes and raw_transcript are required for voice+text source_type"
                )
        return self


class CaptureSegmentHints(BaseModel):
    """Deterministic segmentation hints for model-side placement."""

    has_explicit_price: bool
    price_value: float | None
    looks_like_heading: bool
    looks_like_notes_heading: bool
    looks_like_line_item: bool


class CaptureSegment(BaseModel):
    """One normalized segment generated from capture transcript text."""

    index: int = Field(ge=0)
    raw_text: str = Field(min_length=1, max_length=EXTRACTION_TRANSCRIPT_MAX_CHARS)
    normalized_text: str = Field(min_length=1, max_length=EXTRACTION_TRANSCRIPT_MAX_CHARS)
    hints: CaptureSegmentHints


PlacementConfidence = Literal["high", "medium", "low"]
UnresolvedSegmentSource = Literal[
    "leftover_classification",
    "typed_conflict",
    "transcript_conflict",
]


class PricingHints(BaseModel):
    """Structured pricing suggestions returned by V2 extraction."""

    explicit_total: float | None = None
    deposit_amount: float | None = None
    tax_rate: float | None = None
    discount_type: DiscountType | None = None
    discount_value: float | None = None


class ExtractionSuggestion(BaseModel):
    """Suggestion payload for notes-like content placement."""

    text: str = Field(min_length=1, max_length=LINE_ITEM_DETAILS_MAX_CHARS)
    confidence: PlacementConfidence
    source: UnresolvedSegmentSource


class UnresolvedSegment(BaseModel):
    """Minimal unresolved capture segment surfaced for downstream handling."""

    raw_text: str = Field(min_length=1, max_length=EXTRACTION_TRANSCRIPT_MAX_CHARS)
    confidence: Literal["medium", "low"]
    source: UnresolvedSegmentSource


class LineItemExtractedV2(LineItemExtracted):
    """V2 extraction line-item contract with placement metadata."""

    raw_text: str = Field(min_length=1, max_length=EXTRACTION_TRANSCRIPT_MAX_CHARS)
    confidence: PlacementConfidence = "medium"


class ExtractionResultV2(BaseModel):
    """Internal V2 extraction contract used by integration/guards."""

    transcript: str = Field(min_length=1, max_length=EXTRACTION_TRANSCRIPT_MAX_CHARS)
    pipeline_version: Literal["v2"] = "v2"
    line_items: list[LineItemExtractedV2] = Field(
        default_factory=list,
        max_length=DOCUMENT_LINE_ITEMS_MAX_ITEMS,
    )
    pricing_hints: PricingHints = Field(default_factory=PricingHints)
    customer_notes_suggestion: ExtractionSuggestion | None = None
    unresolved_segments: list[UnresolvedSegment] = Field(default_factory=list)
    confidence_notes: list[Annotated[str, Field(max_length=CONFIDENCE_NOTE_MAX_CHARS)]] = Field(
        default_factory=list,
        max_length=CONFIDENCE_NOTES_MAX_ITEMS,
    )
    extraction_tier: Literal["primary", "degraded"] = "primary"
    extraction_degraded_reason_code: str | None = None


class ExtractionResult(ExtractionResultV2):
    """Structured extraction output returned from extraction endpoints.

    Backward compatibility shim:
    legacy callers/tests may still pass `total`, which maps to
    `pricing_hints.explicit_total`.
    """

    @model_validator(mode="before")
    @classmethod
    def _map_legacy_total_field(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        payload = dict(value)
        if "total" in payload:
            total = payload.pop("total", None)
            pricing_hints = payload.get("pricing_hints")
            if not isinstance(pricing_hints, dict):
                pricing_hints = {}
            pricing_hints = dict(pricing_hints)
            pricing_hints.setdefault("explicit_total", total)
            payload["pricing_hints"] = pricing_hints

        legacy_line_items = payload.get("line_items")
        if isinstance(legacy_line_items, list):
            normalized_items: list[dict[str, Any]] = []
            for candidate in legacy_line_items:
                item_payload: dict[str, Any] | None = None
                if isinstance(candidate, dict):
                    item_payload = dict(candidate)
                else:
                    try:
                        dumped = candidate.model_dump(mode="json")
                    except AttributeError:
                        dumped = None
                    if isinstance(dumped, dict):
                        item_payload = dict(dumped)
                if item_payload is None:
                    continue
                if not item_payload.get("raw_text"):
                    item_payload["raw_text"] = (
                        item_payload.get("details")
                        or item_payload.get("description")
                        or "line item"
                    )
                item_payload.setdefault("confidence", "medium")
                normalized_items.append(item_payload)
            payload["line_items"] = normalized_items
        return payload

    @property
    def total(self) -> float | None:
        """Compatibility accessor for legacy internal callers/tests."""
        return self.pricing_hints.explicit_total


PricingFieldName = Literal["explicit_total", "deposit_amount", "tax_rate", "discount"]


class ExtractionReviewState(BaseModel):
    """Visible grouped extraction review state."""

    notes_pending: bool = False
    pricing_pending: bool = False


class NotesSeededFieldMetadata(BaseModel):
    """Review metadata for notes field seeding provenance."""

    seeded: bool = False
    confidence: PlacementConfidence | None = None
    source: Literal["explicit_notes_section", "derived", "leftover_classification"] | None = None


class PricingSeededFieldMetadata(BaseModel):
    """Review metadata for one pricing field seeding provenance."""

    seeded: bool = False
    source: Literal["explicit_pricing_phrase"] | None = None


class PricingSeededFieldsMetadata(BaseModel):
    """Grouped pricing field provenance."""

    explicit_total: PricingSeededFieldMetadata = Field(default_factory=PricingSeededFieldMetadata)
    deposit_amount: PricingSeededFieldMetadata = Field(default_factory=PricingSeededFieldMetadata)
    tax_rate: PricingSeededFieldMetadata = Field(default_factory=PricingSeededFieldMetadata)
    discount: PricingSeededFieldMetadata = Field(default_factory=PricingSeededFieldMetadata)


class SeededFieldsMetadata(BaseModel):
    """Grouped seeded-field metadata for V2 extraction hydration."""

    notes: NotesSeededFieldMetadata = Field(default_factory=NotesSeededFieldMetadata)
    pricing: PricingSeededFieldsMetadata = Field(default_factory=PricingSeededFieldsMetadata)


class ExtractionReviewAppendSuggestion(BaseModel):
    """Hidden append suggestion persisted in sidecar metadata."""

    id: str
    kind: Literal["note", "pricing"]
    raw_text: str = Field(min_length=1, max_length=EXTRACTION_TRANSCRIPT_MAX_CHARS)
    confidence: Literal["medium", "low"]
    source: Literal["append_capture"] = "append_capture"
    pricing_field: PricingFieldName | None = None


class ExtractionReviewUnresolvedSegment(BaseModel):
    """Hidden unresolved segment persisted in sidecar metadata."""

    id: str
    raw_text: str = Field(min_length=1, max_length=EXTRACTION_TRANSCRIPT_MAX_CHARS)
    confidence: Literal["medium", "low"]
    source: UnresolvedSegmentSource


class ExtractionReviewHiddenDetails(BaseModel):
    """Hidden extraction details shown in Capture Details surfaces."""

    unresolved_segments: list[ExtractionReviewUnresolvedSegment] = Field(default_factory=list)
    append_suggestions: list[ExtractionReviewAppendSuggestion] = Field(default_factory=list)
    confidence_notes: list[Annotated[str, Field(max_length=CONFIDENCE_NOTE_MAX_CHARS)]] = Field(
        default_factory=list,
        max_length=CONFIDENCE_NOTES_MAX_ITEMS,
    )


class HiddenItemState(BaseModel):
    """Lifecycle state persisted for one hidden extraction item."""

    reviewed: bool = False
    dismissed: bool = False


class ExtractionReviewMetadataV1(BaseModel):
    """Sidecar metadata persisted for V2 extraction review behavior."""

    pipeline_version: Literal["v2"] = "v2"
    review_state: ExtractionReviewState = Field(default_factory=ExtractionReviewState)
    seeded_fields: SeededFieldsMetadata = Field(default_factory=SeededFieldsMetadata)
    hidden_details: ExtractionReviewHiddenDetails = Field(
        default_factory=ExtractionReviewHiddenDetails
    )
    hidden_detail_state: dict[str, HiddenItemState] = Field(default_factory=dict)
    extraction_degraded_reason_code: str | None = None

    @classmethod
    def model_validate_with_defaults(
        cls,
        value: object | None,
        *,
        extraction_degraded_reason_code: str | None = None,
    ) -> ExtractionReviewMetadataV1:
        """Deserialize nullable sidecar payloads to a safe default object."""
        if value is None:
            return cls(extraction_degraded_reason_code=extraction_degraded_reason_code)
        metadata = cls.model_validate(value)
        if (
            metadata.extraction_degraded_reason_code is None
            and extraction_degraded_reason_code is not None
        ):
            return metadata.model_copy(
                update={"extraction_degraded_reason_code": extraction_degraded_reason_code}
            )
        return metadata


class PersistedExtractionResponse(ExtractionResult):
    """Successful unified extraction response with the persisted draft id."""

    quote_id: UUID


class ConvertNotesRequest(BaseModel):
    """Request payload for text-note extraction."""

    notes: str = Field(min_length=1, max_length=NOTE_INPUT_MAX_CHARS)


class ManualDraftCreateRequest(BaseModel):
    """Request payload for creating a manual quote draft without extraction."""

    customer_id: UUID | None = None


class QuoteCreateRequest(BaseModel):
    """Request payload for creating a quote from a draft."""

    customer_id: UUID
    title: str | None = Field(default=None, max_length=120)
    transcript: str = Field(min_length=1, max_length=DOCUMENT_TRANSCRIPT_MAX_CHARS)
    line_items: list[LineItemDraft] = Field(
        default_factory=list,
        max_length=DOCUMENT_LINE_ITEMS_MAX_ITEMS,
    )
    total_amount: float | None = None
    tax_rate: float | None = None
    discount_type: DiscountType | None = None
    discount_value: float | None = None
    deposit_amount: float | None = None
    notes: str | None = Field(default=None, max_length=DOCUMENT_NOTES_MAX_CHARS)
    source_type: Literal["text", "voice"]

    _normalize_title = field_validator("title", mode="before")(_normalize_optional_title)


class QuoteUpdateRequest(BaseModel):
    """Request payload for partial quote updates with full line-item replacement."""

    customer_id: UUID | None = None
    title: str | None = Field(default=None, max_length=120)
    transcript: str | None = Field(
        default=None,
        min_length=1,
        max_length=DOCUMENT_TRANSCRIPT_MAX_CHARS,
    )
    line_items: list[LineItemDraft] | None = Field(
        default=None,
        max_length=DOCUMENT_LINE_ITEMS_MAX_ITEMS,
    )
    total_amount: float | None = None
    tax_rate: float | None = None
    discount_type: DiscountType | None = None
    discount_value: float | None = None
    deposit_amount: float | None = None
    notes: str | None = Field(default=None, max_length=DOCUMENT_NOTES_MAX_CHARS)
    doc_type: Literal["quote", "invoice"] | None = None
    due_date: date | None = None

    _normalize_title = field_validator("title", mode="before")(_normalize_optional_title)

    @model_validator(mode="after")
    def validate_line_items_not_null_when_provided(self) -> QuoteUpdateRequest:
        """Reject explicit null for required patch fields while allowing omission."""
        if "line_items" in self.model_fields_set and self.line_items is None:
            raise ValueError("line_items cannot be null")
        if "transcript" in self.model_fields_set and self.transcript is None:
            raise ValueError("transcript cannot be null")
        if "doc_type" in self.model_fields_set and self.doc_type is None:
            raise ValueError("doc_type cannot be null")
        if "due_date" in self.model_fields_set and self.due_date is None:
            raise ValueError("due_date cannot be null")
        return self


class ExtractionReviewStateClearRequest(BaseModel):
    """Request payload for clearing grouped extraction review state flags."""

    notes_pending: Literal[True] | None = None
    pricing_pending: Literal[True] | None = None

    @model_validator(mode="after")
    def validate_has_target(self) -> ExtractionReviewStateClearRequest:
        if self.notes_pending is None and self.pricing_pending is None:
            raise ValueError("clear_review_state must include notes_pending or pricing_pending")
        return self


class ExtractionReviewMetadataUpdateRequest(BaseModel):
    """Sidecar-only mutation payload for hidden-item lifecycle and review state."""

    dismiss_hidden_item: str | None = Field(default=None, min_length=1)
    review_hidden_item: str | None = Field(default=None, min_length=1)
    clear_review_state: ExtractionReviewStateClearRequest | None = None

    @model_validator(mode="after")
    def validate_has_mutation(self) -> ExtractionReviewMetadataUpdateRequest:
        has_action = any(
            (
                self.dismiss_hidden_item is not None,
                self.review_hidden_item is not None,
                self.clear_review_state is not None,
            )
        )
        if not has_action:
            raise ValueError("At least one extraction review metadata mutation is required")
        return self


class LineItemResponse(BaseModel):
    """Serializable line item payload returned in quote responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    description: str
    details: str | None
    price: float | None
    flagged: bool = False
    flag_reason: str | None = None
    sort_order: int


class PublicLineItemResponse(BaseModel):
    """Serializable public line-item payload used by quote landing pages."""

    model_config = ConfigDict(from_attributes=True)

    description: str
    details: str | None
    price: float | None


class QuoteListItemResponse(BaseModel):
    """Serializable quote summary payload returned by the quote list endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    customer_id: UUID | None
    customer_name: str | None
    doc_type: Literal["quote"] = "quote"
    doc_number: str
    title: str | None
    status: str
    total_amount: float | None
    item_count: int
    requires_customer_assignment: bool
    can_reassign_customer: bool
    created_at: datetime


class QuoteResponse(BaseModel):
    """Serializable quote payload returned by quote endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    customer_id: UUID | None
    doc_type: str
    doc_number: str
    title: str | None
    status: str
    source_type: Literal["text", "voice"]
    transcript: str
    total_amount: float | None
    tax_rate: float | None
    discount_type: DiscountType | None
    discount_value: float | None
    deposit_amount: float | None
    notes: str | None
    shared_at: datetime | None
    share_token: str | None
    line_items: list[LineItemResponse]
    created_at: datetime
    updated_at: datetime


class LinkedInvoiceResponse(BaseModel):
    """Compact linked invoice payload returned from quote detail."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    doc_number: str
    status: str
    due_date: date | None
    total_amount: float | None
    created_at: datetime


class PdfArtifactResponse(BaseModel):
    """Durable authenticated PDF artifact state returned in detail payloads."""

    status: Literal["missing", "pending", "ready", "failed"]
    job_id: UUID | None
    download_url: str | None
    terminal_error: str | None


class QuoteDetailResponse(QuoteResponse):
    """Quote detail payload including customer display fields."""

    has_active_share: bool
    extraction_tier: Literal["primary", "degraded"] | None
    extraction_degraded_reason_code: str | None
    customer_name: str | None
    customer_email: str | None
    customer_phone: str | None
    requires_customer_assignment: bool
    can_reassign_customer: bool
    linked_invoice: LinkedInvoiceResponse | None
    pdf_artifact: PdfArtifactResponse
    extraction_review_metadata: ExtractionReviewMetadataV1


class PublicQuoteResponse(BaseModel):
    """Serializable unauthenticated quote payload for the public landing page."""

    doc_type: Literal["quote"]
    business_name: str | None
    owner_name: str | None = None
    customer_name: str
    doc_number: str
    title: str | None
    status: str
    total_amount: float | None
    tax_rate: float | None
    discount_type: DiscountType | None
    discount_value: float | None
    deposit_amount: float | None
    notes: str | None
    issued_date: str
    logo_url: str
    download_url: str
    line_items: list[PublicLineItemResponse]


class PublicInvoiceResponse(BaseModel):
    """Serializable unauthenticated invoice payload for the public landing page."""

    doc_type: Literal["invoice"]
    business_name: str | None
    owner_name: str | None = None
    customer_name: str
    doc_number: str
    title: str | None
    status: Literal["sent"]
    total_amount: float | None
    tax_rate: float | None
    discount_type: DiscountType | None
    discount_value: float | None
    deposit_amount: float | None
    notes: str | None
    issued_date: str
    due_date: str | None
    logo_url: str
    download_url: str
    line_items: list[PublicLineItemResponse]


PublicDocumentResponse = Annotated[
    PublicQuoteResponse | PublicInvoiceResponse,
    Field(discriminator="doc_type"),
]
