"""Scoring utilities for manual extraction quality evaluation runs."""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from difflib import SequenceMatcher
from math import isclose
from typing import Any, Literal

from app.features.quotes.schemas import ExtractionResult, LineItemExtracted
from app.integrations.extraction import ExtractionCallMetadata

_DESCRIPTION_MATCH_THRESHOLD = 0.4
_WHITESPACE_PATTERN = re.compile(r"\s+")


@dataclass(frozen=True, slots=True)
class ExpectedLineItem:
    """Ground truth definition for one expected extraction line item."""

    description: str
    price: float | None = None
    details: str | None = None
    must_match: bool = True
    expected_flagged: bool = False
    expected_flag_reason_substring: str | None = None
    price_tolerance_pct: float = 0.05


@dataclass(frozen=True, slots=True)
class ExtractionQualityCase:
    """Ground truth case for extraction quality measurement."""

    name: str
    transcript: str
    expected_line_items: tuple[ExpectedLineItem, ...]
    expected_total: float | None = None
    expected_total_tolerance_pct: float = 0.05
    expected_line_item_count_min: int | None = None
    expected_line_item_count_max: int | None = None
    expect_prices: bool = True
    expect_total: bool = True
    confidence_note_substrings: tuple[str, ...] = ()
    category: str = "general"
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    cost_tier: Literal["standard", "high"] = "standard"
    human_notes: str | None = None


@dataclass(frozen=True, slots=True)
class ItemMatchResult:
    """Scored match result for one expected line item."""

    expected: ExpectedLineItem
    matched: bool
    description_score: float
    price_score: float
    details_score: float | None
    flag_score: float | None


@dataclass(frozen=True, slots=True)
class CaseScore:
    """Per-case extraction quality score and supporting metrics."""

    name: str
    category: str
    difficulty: str
    item_scores: tuple[ItemMatchResult, ...]
    total_score: float
    confidence_note_score: float | None
    precision: float
    recall: float
    extras_count: int
    missing_count: int
    overall: float


def _normalize_text(value: str) -> str:
    return _WHITESPACE_PATTERN.sub(" ", value).strip().casefold()


def _description_similarity(left: str, right: str) -> float:
    left_norm = _normalize_text(left)
    right_norm = _normalize_text(right)
    if not left_norm or not right_norm:
        return 0.0
    return SequenceMatcher(a=left_norm, b=right_norm).ratio()


def _average(values: Iterable[float], *, default: float) -> float:
    values_list = list(values)
    if not values_list:
        return default
    return sum(values_list) / len(values_list)


def _clamp(value: float, *, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def _is_same_order_of_magnitude(expected: float, actual: float) -> bool:
    if expected == 0:
        return actual == 0
    ratio = abs(actual) / abs(expected)
    return 0.1 <= ratio <= 10.0


def _score_price(
    expected_price: float | None, actual_price: float | None, tolerance_pct: float
) -> float:
    if expected_price is None:
        return 1.0 if actual_price is None else 0.0

    if actual_price is None:
        return 0.5

    if isclose(expected_price, actual_price, abs_tol=0.01):
        return 1.0

    tolerance = abs(expected_price) * max(tolerance_pct, 0.0)
    if abs(actual_price - expected_price) <= tolerance:
        return 0.75

    if _is_same_order_of_magnitude(expected_price, actual_price):
        return 0.25
    return 0.0


def _score_details(
    expected_details: str | None, actual_details: str | None, *, matched: bool
) -> float | None:
    if expected_details is None:
        return None
    if not matched:
        return 0.0
    if actual_details is None or not actual_details.strip():
        return 0.5

    expected_norm = _normalize_text(expected_details)
    actual_norm = _normalize_text(actual_details)
    return 1.0 if expected_norm in actual_norm else 0.0


def _score_flag(
    expected: ExpectedLineItem, actual: LineItemExtracted | None, *, matched: bool
) -> float | None:
    if not expected.expected_flagged:
        return None
    if not matched or actual is None:
        return 0.0
    if not actual.flagged:
        return 0.0

    if expected.expected_flag_reason_substring is None:
        return 1.0

    flag_reason = actual.flag_reason or ""
    expected_fragment = expected.expected_flag_reason_substring.casefold()
    return 1.0 if expected_fragment in flag_reason.casefold() else 0.0


def _best_candidate_index(
    expected: ExpectedLineItem,
    actual: Sequence[LineItemExtracted],
    consumed_indices: set[int],
) -> tuple[int, float] | None:
    best_index: int | None = None
    best_score = 0.0

    for index, item in enumerate(actual):
        if index in consumed_indices:
            continue
        similarity = _description_similarity(expected.description, item.description)
        if similarity < _DESCRIPTION_MATCH_THRESHOLD:
            continue
        if similarity > best_score:
            best_index = index
            best_score = similarity

    if best_index is None:
        return None
    return best_index, best_score


def match_line_items(
    expected: Sequence[ExpectedLineItem],
    actual: Sequence[LineItemExtracted],
) -> list[ItemMatchResult]:
    """Greedy one-to-one assignment of expected items to output line items."""

    prioritized_indices = sorted(
        range(len(expected)),
        key=lambda index: (0 if expected[index].must_match else 1, index),
    )
    consumed_indices: set[int] = set()
    results_by_index: list[ItemMatchResult | None] = [None] * len(expected)

    for expected_index in prioritized_indices:
        expected_item = expected[expected_index]
        candidate = _best_candidate_index(expected_item, actual, consumed_indices)

        if candidate is None:
            results_by_index[expected_index] = ItemMatchResult(
                expected=expected_item,
                matched=False,
                description_score=0.0,
                price_score=0.0,
                details_score=_score_details(expected_item.details, None, matched=False),
                flag_score=_score_flag(expected_item, None, matched=False),
            )
            continue

        actual_index, description_score = candidate
        consumed_indices.add(actual_index)
        actual_item = actual[actual_index]
        results_by_index[expected_index] = ItemMatchResult(
            expected=expected_item,
            matched=True,
            description_score=description_score,
            price_score=_score_price(
                expected_item.price,
                actual_item.price,
                expected_item.price_tolerance_pct,
            ),
            details_score=_score_details(
                expected_item.details,
                actual_item.details,
                matched=True,
            ),
            flag_score=_score_flag(expected_item, actual_item, matched=True),
        )

    return [result for result in results_by_index if result is not None]


def _score_total(
    expected_total: float | None, actual_total: float | None, tolerance_pct: float
) -> float:
    if expected_total is None:
        return 1.0 if actual_total is None else 0.0
    if actual_total is None:
        return 0.0
    if isclose(expected_total, actual_total, abs_tol=0.01):
        return 1.0

    tolerance = abs(expected_total) * max(tolerance_pct, 0.0)
    distance = abs(actual_total - expected_total)
    if distance <= tolerance:
        return 0.9
    if distance <= (2 * tolerance):
        return 0.3
    return 0.0


def _score_confidence_notes(expected: Sequence[str], actual_notes: Sequence[str]) -> float | None:
    if not expected:
        return None

    folded_notes = [note.casefold() for note in actual_notes]
    found_count = 0
    for fragment in expected:
        folded_fragment = fragment.casefold()
        if any(folded_fragment in note for note in folded_notes):
            found_count += 1

    return found_count / len(expected)


def _description_recall(item_scores: Sequence[ItemMatchResult]) -> float:
    must_match_items = [
        score.description_score for score in item_scores if score.expected.must_match
    ]
    return _average(must_match_items, default=1.0)


def _price_accuracy(item_scores: Sequence[ItemMatchResult]) -> float:
    priced_items = [score.price_score for score in item_scores if score.expected.price is not None]
    return _average(priced_items, default=1.0)


def _details_accuracy(item_scores: Sequence[ItemMatchResult]) -> float:
    details_items = [
        score.details_score
        for score in item_scores
        if score.expected.details is not None and score.details_score is not None
    ]
    return _average((float(value) for value in details_items), default=1.0)


def score_case(
    case: ExtractionQualityCase,
    result: ExtractionResult,
    metadata: ExtractionCallMetadata | None = None,
) -> CaseScore:
    """Score one extraction result against a quality case ground truth."""

    _ = metadata  # Reserved for future scoring dimensions tied to call metadata.

    item_scores = tuple(match_line_items(case.expected_line_items, result.line_items))

    matched_count = sum(1 for score in item_scores if score.matched)
    extras_count = max(len(result.line_items) - matched_count, 0)

    required_item_scores = [score for score in item_scores if score.expected.must_match]
    missing_count = sum(1 for score in required_item_scores if not score.matched)

    true_positives = matched_count
    false_positives = extras_count
    precision_denominator = true_positives + false_positives
    precision = true_positives / precision_denominator if precision_denominator else 1.0

    required_total = len(required_item_scores)
    recall = (required_total - missing_count) / required_total if required_total else 1.0

    description_recall = _description_recall(item_scores)
    price_accuracy = _price_accuracy(item_scores)
    details_accuracy = _details_accuracy(item_scores)
    total_score = _score_total(case.expected_total, result.total, case.expected_total_tolerance_pct)
    extras_penalty = min(extras_count / max(len(case.expected_line_items), 1), 1.0)

    overall = _clamp(
        (0.40 * description_recall)
        + (0.25 * price_accuracy)
        + (0.15 * total_score)
        + (0.10 * details_accuracy)
        + (0.10 * (1.0 - extras_penalty))
    )

    confidence_note_score = _score_confidence_notes(
        case.confidence_note_substrings,
        result.confidence_notes,
    )

    return CaseScore(
        name=case.name,
        category=case.category,
        difficulty=case.difficulty,
        item_scores=item_scores,
        total_score=total_score,
        confidence_note_score=confidence_note_score,
        precision=precision,
        recall=recall,
        extras_count=extras_count,
        missing_count=missing_count,
        overall=overall,
    )


def aggregate_scores(scores: Sequence[CaseScore]) -> dict[str, Any]:
    """Compute overall, category, and difficulty score aggregates."""

    if not scores:
        return {
            "overall": 0.0,
            "count": 0,
            "by_category": {},
            "by_difficulty": {},
        }

    def _group_average(
        values: Sequence[CaseScore], field: str
    ) -> dict[str, dict[str, float | int]]:
        grouped: dict[str, list[float]] = {}
        for score in values:
            group = getattr(score, field)
            grouped.setdefault(group, []).append(score.overall)
        return {
            group: {"average": sum(group_scores) / len(group_scores), "count": len(group_scores)}
            for group, group_scores in grouped.items()
        }

    return {
        "overall": sum(score.overall for score in scores) / len(scores),
        "count": len(scores),
        "by_category": _group_average(scores, "category"),
        "by_difficulty": _group_average(scores, "difficulty"),
    }


def format_report(cases: Sequence[ExtractionQualityCase], scores: Sequence[CaseScore]) -> str:
    """Build a concise human-readable report for quality eval runs."""

    score_by_name = {score.name: score for score in scores}
    lines: list[str] = ["=== EXTRACTION QUALITY REPORT ==="]

    for case in cases:
        score = score_by_name.get(case.name)
        if score is None:
            continue

        matched_count = sum(1 for item_score in score.item_scores if item_score.matched)
        expected_count = len(case.expected_line_items)
        description_recall = _description_recall(score.item_scores)
        price_accuracy = _price_accuracy(score.item_scores)
        details_items_exist = any(item.expected.details is not None for item in score.item_scores)
        details_accuracy = _details_accuracy(score.item_scores) if details_items_exist else None

        lines.append(f"[{case.name}] {case.difficulty}/{case.category}")
        lines.append(
            f"  Items: {matched_count}/{expected_count} matched, {score.extras_count} extras"
        )
        details_label = f"{details_accuracy:.2f}" if details_accuracy is not None else "n/a"
        lines.append(
            "  Description: "
            f"{description_recall:.2f}  Price: {price_accuracy:.2f}  "
            f"Details: {details_label}  Total: {score.total_score:.2f}"
        )
        if score.confidence_note_score is not None:
            lines.append(f"  Confidence notes: {score.confidence_note_score:.2f}")
        lines.append(f"  Overall: {score.overall:.2f}")

    summary = aggregate_scores(scores)
    lines.append("=== EXTRACTION QUALITY SUMMARY ===")
    lines.append(f"Overall: {summary['overall']:.2f}")
    lines.append("By category:")
    for category in sorted(summary["by_category"].keys()):
        category_summary = summary["by_category"][category]
        lines.append(
            f"  {category}: {category_summary['average']:.2f} ({category_summary['count']} cases)"
        )
    lines.append("By difficulty:")
    for difficulty in sorted(summary["by_difficulty"].keys()):
        difficulty_summary = summary["by_difficulty"][difficulty]
        lines.append(
            "  "
            f"{difficulty}: {difficulty_summary['average']:.2f} "
            f"({difficulty_summary['count']} cases)"
        )

    return "\n".join(lines)
