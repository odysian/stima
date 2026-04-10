"""Live extraction validation against the real Claude API for transcript fixtures."""

from __future__ import annotations

import pytest

from app.core.config import get_settings
from app.features.quotes.schemas import ExtractionResult
from app.features.quotes.tests.fixtures.transcripts import TRANSCRIPTS
from app.integrations.extraction import ExtractionIntegration

_SETTINGS = get_settings()

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(
        not _SETTINGS.anthropic_api_key.strip(),
        reason="Live extraction tests require ANTHROPIC_API_KEY in backend/.env",
    ),
]


def _build_integration() -> ExtractionIntegration:
    return ExtractionIntegration(
        api_key=_SETTINGS.anthropic_api_key,
        model=_SETTINGS.extraction_model,
        fallback_model=_SETTINGS.extraction_fallback_model,
        primary_prompt_variant=_SETTINGS.extraction_primary_prompt_variant,
        fallback_prompt_variant=_SETTINGS.extraction_fallback_prompt_variant,
    )


def _format_price(price: float | None) -> str:
    if price is None:
        return "no price"
    return f"${price:.2f}"


def _print_report_card(name: str, result: ExtractionResult) -> None:
    items = (
        ", ".join(f"{item.description} ({_format_price(item.price)})" for item in result.line_items)
        or "none"
    )
    total = _format_price(result.total)
    print(f"[{name}]")
    print(f"  items: {items}")
    print(f"  total: {total}")
    print(f"  confidence: {result.confidence_notes}")


@pytest.mark.live
async def test_live_clean_with_total() -> None:
    result = await _build_integration().extract(TRANSCRIPTS["clean_with_total"])
    _print_report_card("clean_with_total", result)

    assert result.total == pytest.approx(435)
    assert result.line_items
    priced_items = [item.price for item in result.line_items if item.price is not None]
    assert priced_items
    assert sum(priced_items) == pytest.approx(435)


@pytest.mark.live
async def test_live_clean_no_prices() -> None:
    result = await _build_integration().extract(TRANSCRIPTS["clean_no_prices"])
    _print_report_card("clean_no_prices", result)

    assert result.total is None
    assert result.line_items
    assert all(item.price is None for item in result.line_items)


@pytest.mark.live
async def test_live_total_only() -> None:
    result = await _build_integration().extract(TRANSCRIPTS["total_only"])
    _print_report_card("total_only", result)

    assert result.total == pytest.approx(2100)
    assert result.line_items
    assert all(item.price is None for item in result.line_items)


@pytest.mark.live
async def test_live_partial_ambiguous() -> None:
    result = await _build_integration().extract(TRANSCRIPTS["partial_ambiguous"])
    _print_report_card("partial_ambiguous", result)

    assert result.line_items
    prices = [item.price for item in result.line_items]
    assert any(price is not None for price in prices)
    assert any(price is None for price in prices)
    assert result.confidence_notes


@pytest.mark.live
async def test_live_noisy_with_hesitation() -> None:
    result = await _build_integration().extract(TRANSCRIPTS["noisy_with_hesitation"])
    _print_report_card("noisy_with_hesitation", result)

    assert result.total is None
    prices = [item.price for item in result.line_items if item.price is not None]
    assert prices
    assert any(price == pytest.approx(120) for price in prices)


@pytest.mark.live
async def test_live_no_pricing_at_all() -> None:
    result = await _build_integration().extract(TRANSCRIPTS["no_pricing_at_all"])
    _print_report_card("no_pricing_at_all", result)

    assert result.total is None
    assert result.line_items
    assert all(item.price is None for item in result.line_items)
    assert result.confidence_notes


@pytest.mark.live
@pytest.mark.skipif(
    not _SETTINGS.extraction_fallback_model,
    reason="Fallback live probe requires EXTRACTION_FALLBACK_MODEL in backend/.env",
)
async def test_live_fallback_tier_probe_uses_fallback_model_after_primary_exhaustion() -> None:
    integration = ExtractionIntegration(
        api_key=_SETTINGS.anthropic_api_key,
        model="stima-invalid-primary-model",
        fallback_model=_SETTINGS.extraction_fallback_model,
        max_attempts=1,
        primary_prompt_variant=_SETTINGS.extraction_primary_prompt_variant,
        fallback_prompt_variant=_SETTINGS.extraction_fallback_prompt_variant,
    )

    transcript = TRANSCRIPTS["fallback_tier_probe"]
    result = await integration.extract(transcript)
    metadata = integration.pop_last_call_metadata()

    _print_report_card("fallback_tier_probe", result)

    assert result.transcript == transcript
    assert metadata is not None
    assert metadata.invocation_tier == "fallback"
    assert metadata.model_id == _SETTINGS.extraction_fallback_model
