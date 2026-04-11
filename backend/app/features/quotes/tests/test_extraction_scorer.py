"""Offline unit tests for extraction quality scoring utilities."""

from __future__ import annotations

import pytest

from app.features.quotes.schemas import ExtractionResult, LineItemExtracted
from app.features.quotes.tests.scoring import extraction_scorer as scorer_module
from app.features.quotes.tests.scoring.extraction_scorer import (
    CaseScore,
    ExpectedLineItem,
    ExtractionQualityCase,
    _score_price,
    _score_total,
    aggregate_scores,
    format_report,
    match_line_items,
    score_case,
)


def _item(
    description: str,
    *,
    price: float | None = None,
    details: str | None = None,
    flagged: bool = False,
    flag_reason: str | None = None,
) -> LineItemExtracted:
    return LineItemExtracted(
        description=description,
        price=price,
        details=details,
        flagged=flagged,
        flag_reason=flag_reason,
    )


def _result(
    line_items: list[LineItemExtracted],
    *,
    total: float | None = None,
    confidence_notes: list[str] | None = None,
) -> ExtractionResult:
    return ExtractionResult(
        transcript="unit test transcript",
        line_items=line_items,
        total=total,
        confidence_notes=confidence_notes or [],
    )


def test_match_line_items_enforces_one_to_one_consumption() -> None:
    expected = (
        ExpectedLineItem(description="clean gutters"),
        ExpectedLineItem(description="clean gutters back side"),
    )
    actual = [_item("clean gutters")]

    matches = match_line_items(expected, actual)

    assert len(matches) == 2
    assert sum(1 for match in matches if match.matched) == 1


def test_score_case_zero_division_guards_no_must_match_items() -> None:
    case = ExtractionQualityCase(
        name="no_must_match",
        transcript="optional only",
        expected_line_items=(
            ExpectedLineItem(description="optional service", must_match=False),
        ),
        expected_total=None,
    )

    score = score_case(case, _result([]))

    assert score.recall == 1.0
    assert score.missing_count == 0


def test_score_case_zero_division_guards_no_priced_or_details_items() -> None:
    case = ExtractionQualityCase(
        name="no_price_no_details",
        transcript="trim shrubs",
        expected_line_items=(
            ExpectedLineItem(description="trim shrubs", price=None, details=None),
        ),
        expected_total=None,
    )

    score = score_case(case, _result([_item("trim shrubs")]))

    assert score.overall == pytest.approx(1.0)
    assert score.total_score == pytest.approx(1.0)


def test_score_case_clamps_overall_upper_bound(monkeypatch: pytest.MonkeyPatch) -> None:
    case = ExtractionQualityCase(
        name="clamp_upper",
        transcript="x",
        expected_line_items=(ExpectedLineItem(description="x"),),
    )
    result = _result([_item("x")])

    monkeypatch.setattr(scorer_module, "_description_recall", lambda _: 5.0)
    monkeypatch.setattr(scorer_module, "_price_accuracy", lambda _: 5.0)
    monkeypatch.setattr(scorer_module, "_details_accuracy", lambda _: 5.0)
    monkeypatch.setattr(scorer_module, "_score_total", lambda *_args: 5.0)

    score = score_case(case, result)

    assert score.overall == 1.0


def test_score_case_clamps_overall_lower_bound(monkeypatch: pytest.MonkeyPatch) -> None:
    case = ExtractionQualityCase(
        name="clamp_lower",
        transcript="x",
        expected_line_items=(ExpectedLineItem(description="x"),),
    )
    result = _result([_item("x")])

    monkeypatch.setattr(scorer_module, "_description_recall", lambda _: -5.0)
    monkeypatch.setattr(scorer_module, "_price_accuracy", lambda _: -5.0)
    monkeypatch.setattr(scorer_module, "_details_accuracy", lambda _: -5.0)
    monkeypatch.setattr(scorer_module, "_score_total", lambda *_args: -5.0)

    score = score_case(case, result)

    assert score.overall == 0.0


def test_score_price_tier_bands() -> None:
    assert _score_price(None, None, 0.05) == 1.0
    assert _score_price(100.0, None, 0.05) == 0.5
    assert _score_price(100.0, 100.0, 0.05) == 1.0
    assert _score_price(100.0, 104.0, 0.05) == 0.75
    assert _score_price(100.0, 130.0, 0.05) == 0.25
    assert _score_price(100.0, 2000.0, 0.05) == 0.0


def test_score_total_tolerance_bands() -> None:
    assert _score_total(None, None, 0.05) == 1.0
    assert _score_total(None, 10.0, 0.05) == 0.0
    assert _score_total(100.0, 100.0, 0.05) == 1.0
    assert _score_total(100.0, 104.0, 0.05) == 0.9
    assert _score_total(100.0, 108.0, 0.05) == 0.3
    assert _score_total(100.0, 111.0, 0.05) == 0.0


def test_aggregate_scores_groups_by_category_and_difficulty() -> None:
    scores = (
        CaseScore(
            name="a",
            category="services",
            difficulty="easy",
            item_scores=(),
            total_score=1.0,
            confidence_note_score=None,
            precision=1.0,
            recall=1.0,
            extras_count=0,
            missing_count=0,
            overall=0.8,
        ),
        CaseScore(
            name="b",
            category="services",
            difficulty="hard",
            item_scores=(),
            total_score=1.0,
            confidence_note_score=None,
            precision=1.0,
            recall=1.0,
            extras_count=0,
            missing_count=0,
            overall=0.6,
        ),
        CaseScore(
            name="c",
            category="materials",
            difficulty="easy",
            item_scores=(),
            total_score=1.0,
            confidence_note_score=None,
            precision=1.0,
            recall=1.0,
            extras_count=0,
            missing_count=0,
            overall=1.0,
        ),
    )

    aggregate = aggregate_scores(scores)

    assert aggregate["overall"] == pytest.approx((0.8 + 0.6 + 1.0) / 3)
    assert aggregate["by_category"]["services"]["average"] == pytest.approx(0.7)
    assert aggregate["by_category"]["services"]["count"] == 2
    assert aggregate["by_difficulty"]["easy"]["average"] == pytest.approx(0.9)
    assert aggregate["by_difficulty"]["easy"]["count"] == 2


def test_format_report_includes_case_lines_and_summary() -> None:
    case = ExtractionQualityCase(
        name="report_case",
        transcript="trim shrubs for 50",
        expected_line_items=(ExpectedLineItem(description="trim shrubs", price=50),),
        expected_total=50,
        category="services",
        difficulty="easy",
    )
    score = score_case(case, _result([_item("trim shrubs", price=50)], total=50))

    report = format_report((case,), (score,))

    assert "=== EXTRACTION QUALITY REPORT ===" in report
    assert "[report_case] easy/services" in report
    assert "=== EXTRACTION QUALITY SUMMARY ===" in report
    assert "By category:" in report
    assert "By difficulty:" in report
