"""Focused shared pricing math and validation tests."""

from __future__ import annotations

from decimal import Decimal

import pytest
from app.shared.pricing import (
    PricingInput,
    PricingValidationError,
    calculate_breakdown_from_persisted,
    validate_and_calculate_from_input,
)


def test_validate_and_calculate_rejects_deposit_larger_than_total() -> None:
    with pytest.raises(PricingValidationError, match="Deposit cannot exceed the total amount"):
        validate_and_calculate_from_input(
            subtotal_input=Decimal("100.00"),
            line_item_sum=Decimal("100.00"),
            discount_type=None,
            discount_value=None,
            tax_rate=None,
            deposit_amount=Decimal("100.01"),
        )


def test_validate_and_calculate_rounds_tax_half_up() -> None:
    pricing, breakdown = validate_and_calculate_from_input(
        subtotal_input=Decimal("99.99"),
        line_item_sum=Decimal("99.99"),
        discount_type=None,
        discount_value=None,
        tax_rate=Decimal("0.0825"),
        deposit_amount=None,
    )

    assert breakdown.tax_amount == Decimal("8.25")
    assert breakdown.total_amount == Decimal("108.24")
    assert pricing.total_amount == Decimal("108.24")


def test_calculate_breakdown_from_persisted_recovers_percent_discount_subtotal() -> None:
    breakdown = calculate_breakdown_from_persisted(
        PricingInput(
            total_amount=Decimal("176.00"),
            discount_type="percent",
            discount_value=Decimal("20.00"),
            tax_rate=Decimal("0.10"),
            deposit_amount=Decimal("50.00"),
        ),
        line_item_sum=None,
    )

    assert breakdown.subtotal == Decimal("200.00")
    assert breakdown.discount_amount == Decimal("40.00")
    assert breakdown.tax_amount == Decimal("16.00")
    assert breakdown.total_amount == Decimal("176.00")
    assert breakdown.balance_due == Decimal("126.00")
