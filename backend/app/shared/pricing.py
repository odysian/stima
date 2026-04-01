"""Shared document pricing calculations and validation."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal, cast

DiscountType = Literal["fixed", "percent"]

_ZERO = Decimal("0")
_ONE = Decimal("1")
_HUNDRED = Decimal("100")
_MONEY_QUANTIZER = Decimal("0.01")


class PricingValidationError(Exception):
    """Raised when optional pricing inputs violate the document pricing contract."""


@dataclass(frozen=True, slots=True)
class PricingInput:
    """Normalized persisted pricing inputs for one document."""

    total_amount: Decimal | None
    discount_type: DiscountType | None
    discount_value: Decimal | None
    tax_rate: Decimal | None
    deposit_amount: Decimal | None

    @property
    def has_active_pricing(self) -> bool:
        """Return true when any optional pricing field is populated."""
        return any(
            value is not None for value in (self.discount_type, self.tax_rate, self.deposit_amount)
        )


@dataclass(frozen=True, slots=True)
class PricingBreakdown:
    """Derived pricing rows shown across app UI, PDFs, and public views."""

    subtotal: Decimal | None
    discount_type: DiscountType | None
    discount_value: Decimal | None
    discount_amount: Decimal | None
    tax_rate: Decimal | None
    tax_amount: Decimal | None
    total_amount: Decimal | None
    deposit_amount: Decimal | None
    balance_due: Decimal | None

    @property
    def has_pricing_breakdown(self) -> bool:
        """Return true when any optional pricing row should render."""
        return any(
            value is not None
            for value in (
                self.discount_amount,
                self.tax_amount,
                self.deposit_amount,
            )
        )


def normalize_pricing_input(
    *,
    total_amount: Decimal | None,
    discount_type: str | None,
    discount_value: Decimal | None,
    tax_rate: Decimal | None,
    deposit_amount: Decimal | None,
) -> PricingInput:
    """Normalize zero-valued optional pricing fields to null."""
    normalized_discount_value = _normalize_optional_amount(discount_value)
    normalized_tax_rate = _normalize_optional_amount(tax_rate)
    normalized_deposit_amount = _normalize_optional_amount(deposit_amount)
    normalized_discount_type = (
        None if normalized_discount_value is None else _normalize_discount_type(discount_type)
    )
    return PricingInput(
        total_amount=total_amount,
        discount_type=normalized_discount_type,
        discount_value=normalized_discount_value,
        tax_rate=normalized_tax_rate,
        deposit_amount=normalized_deposit_amount,
    )


def validate_and_calculate_from_input(
    *,
    subtotal_input: Decimal | None,
    line_item_sum: Decimal | None,
    discount_type: str | None,
    discount_value: Decimal | None,
    tax_rate: Decimal | None,
    deposit_amount: Decimal | None,
) -> tuple[PricingInput, PricingBreakdown]:
    """Validate one document pricing payload and return normalized persisted values."""
    normalized_subtotal = subtotal_input if subtotal_input is not None else line_item_sum
    normalized = normalize_pricing_input(
        total_amount=normalized_subtotal,
        discount_type=discount_type,
        discount_value=discount_value,
        tax_rate=tax_rate,
        deposit_amount=deposit_amount,
    )

    if discount_type is None and discount_value is not None and normalized.discount_value is None:
        # `0` clears discount entirely and behaves like omission.
        breakdown = calculate_breakdown_from_subtotal(
            subtotal=normalized.total_amount,
            discount_type=normalized.discount_type,
            discount_value=normalized.discount_value,
            tax_rate=normalized.tax_rate,
            deposit_amount=normalized.deposit_amount,
        )
        return (
            PricingInput(
                total_amount=breakdown.total_amount,
                discount_type=normalized.discount_type,
                discount_value=normalized.discount_value,
                tax_rate=normalized.tax_rate,
                deposit_amount=normalized.deposit_amount,
            ),
            breakdown,
        )

    _validate_negative_amount("discount value", normalized.discount_value)
    _validate_negative_amount("deposit amount", normalized.deposit_amount)
    _validate_discount_fields(
        discount_type=discount_type,
        discount_value=discount_value,
        normalized_discount_type=normalized.discount_type,
        normalized_discount_value=normalized.discount_value,
    )
    _validate_tax_rate(normalized.tax_rate)

    if normalized.has_active_pricing and normalized.total_amount is None:
        raise PricingValidationError("Total amount is required when using pricing controls")

    if normalized.total_amount is not None and normalized.discount_type is not None:
        discount_amount = _calculate_discount_amount(
            subtotal=normalized.total_amount,
            discount_type=normalized.discount_type,
            discount_value=normalized.discount_value,
        )
        if discount_amount > normalized.total_amount:
            raise PricingValidationError("Discount cannot exceed the subtotal")

    breakdown = calculate_breakdown_from_subtotal(
        subtotal=normalized.total_amount,
        discount_type=normalized.discount_type,
        discount_value=normalized.discount_value,
        tax_rate=normalized.tax_rate,
        deposit_amount=normalized.deposit_amount,
    )
    return (
        PricingInput(
            total_amount=breakdown.total_amount,
            discount_type=normalized.discount_type,
            discount_value=normalized.discount_value,
            tax_rate=normalized.tax_rate,
            deposit_amount=normalized.deposit_amount,
        ),
        breakdown,
    )


def calculate_breakdown_from_subtotal(
    *,
    subtotal: Decimal | None,
    discount_type: DiscountType | None,
    discount_value: Decimal | None,
    tax_rate: Decimal | None,
    deposit_amount: Decimal | None,
) -> PricingBreakdown:
    """Build persisted pricing totals from a user-entered subtotal input."""
    discount_amount = (
        _calculate_discount_amount(
            subtotal=subtotal,
            discount_type=discount_type,
            discount_value=discount_value,
        )
        if subtotal is not None and discount_type is not None
        else None
    )
    taxable_subtotal = (
        subtotal - discount_amount
        if subtotal is not None and discount_amount is not None
        else subtotal
    )
    tax_amount = (
        _quantize_money(taxable_subtotal * tax_rate)
        if taxable_subtotal is not None and tax_rate is not None
        else None
    )
    total_amount = (
        _quantize_money(taxable_subtotal + (tax_amount or _ZERO))
        if taxable_subtotal is not None
        else None
    )
    balance_due = (
        _quantize_money(total_amount - deposit_amount)
        if total_amount is not None and deposit_amount is not None
        else total_amount
    )
    return PricingBreakdown(
        subtotal=_quantize_money(subtotal) if subtotal is not None else None,
        discount_type=discount_type,
        discount_value=discount_value,
        discount_amount=discount_amount,
        tax_rate=tax_rate,
        tax_amount=tax_amount,
        total_amount=total_amount,
        deposit_amount=deposit_amount,
        balance_due=balance_due,
    )


def calculate_breakdown_from_persisted(
    pricing: PricingInput,
    *,
    line_item_sum: Decimal | None,
) -> PricingBreakdown:
    """Build render-ready pricing rows from persisted document values."""
    subtotal = _resolve_subtotal_from_persisted(pricing, line_item_sum=line_item_sum)
    discount_amount = (
        _calculate_discount_amount(
            subtotal=subtotal,
            discount_type=pricing.discount_type,
            discount_value=pricing.discount_value,
        )
        if subtotal is not None and pricing.discount_type is not None
        else None
    )
    taxable_subtotal = (
        subtotal - discount_amount
        if subtotal is not None and discount_amount is not None
        else subtotal
    )
    tax_amount = (
        _quantize_money(taxable_subtotal * pricing.tax_rate)
        if taxable_subtotal is not None and pricing.tax_rate is not None
        else None
    )
    total_amount = pricing.total_amount
    balance_due = (
        _quantize_money(total_amount - pricing.deposit_amount)
        if total_amount is not None and pricing.deposit_amount is not None
        else total_amount
    )
    return PricingBreakdown(
        subtotal=_quantize_money(subtotal) if subtotal is not None else None,
        discount_type=pricing.discount_type,
        discount_value=pricing.discount_value,
        discount_amount=discount_amount,
        tax_rate=pricing.tax_rate,
        tax_amount=tax_amount,
        total_amount=total_amount,
        deposit_amount=pricing.deposit_amount,
        balance_due=balance_due,
    )


def calculate_line_item_sum(prices: list[Decimal | None]) -> Decimal | None:
    """Return the sum of non-null line item prices or null when none are priced."""
    priced_values = [price for price in prices if price is not None]
    if not priced_values:
        return None
    return _quantize_money(sum(priced_values, start=_ZERO))


def to_decimal(value: float | None) -> Decimal | None:
    """Convert float inputs to Decimal without float precision drift."""
    if value is None:
        return None
    return Decimal(str(value))


def _resolve_subtotal_from_persisted(
    pricing: PricingInput,
    *,
    line_item_sum: Decimal | None,
) -> Decimal | None:
    total_amount = pricing.total_amount
    if total_amount is None:
        return line_item_sum
    if pricing.discount_type is None and pricing.tax_rate is None:
        return total_amount
    tax_multiplier = _ONE + (pricing.tax_rate or _ZERO)
    if pricing.discount_type == "fixed":
        return (total_amount / tax_multiplier) + (pricing.discount_value or _ZERO)
    if pricing.discount_type == "percent":
        percent_discount = pricing.discount_value or _ZERO
        if percent_discount == _HUNDRED:
            if line_item_sum is not None:
                return line_item_sum
            return _ZERO
        percent_multiplier = _ONE - (percent_discount / _HUNDRED)
        return total_amount / (tax_multiplier * percent_multiplier)
    return total_amount / tax_multiplier


def _validate_discount_fields(
    *,
    discount_type: str | None,
    discount_value: Decimal | None,
    normalized_discount_type: DiscountType | None,
    normalized_discount_value: Decimal | None,
) -> None:
    raw_type_set = discount_type is not None
    raw_value_set = discount_value is not None
    if raw_type_set != raw_value_set:
        raise PricingValidationError("Discount type and value must be provided together")
    if normalized_discount_type == "percent" and normalized_discount_value is not None:
        if normalized_discount_value < _ZERO or normalized_discount_value > _HUNDRED:
            raise PricingValidationError("Percent discount must be between 0 and 100")


def _validate_tax_rate(tax_rate: Decimal | None) -> None:
    if tax_rate is None:
        return
    if tax_rate < _ZERO or tax_rate > _ONE:
        raise PricingValidationError("Tax rate must be between 0 and 1")


def _validate_negative_amount(label: str, value: Decimal | None) -> None:
    if value is not None and value < _ZERO:
        raise PricingValidationError(f"{label.capitalize()} cannot be negative")


def _calculate_discount_amount(
    *,
    subtotal: Decimal,
    discount_type: DiscountType,
    discount_value: Decimal | None,
) -> Decimal:
    value = discount_value or _ZERO
    if discount_type == "fixed":
        return _quantize_money(value)
    return _quantize_money(subtotal * (value / _HUNDRED))


def _normalize_discount_type(value: str | None) -> DiscountType | None:
    if value is None:
        return None
    if value not in {"fixed", "percent"}:
        raise PricingValidationError("Discount type must be 'fixed' or 'percent'")
    return cast(DiscountType, value)


def _normalize_optional_amount(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    if value == _ZERO:
        return None
    return value


def _quantize_money(value: Decimal) -> Decimal:
    return value.quantize(_MONEY_QUANTIZER, rounding=ROUND_HALF_UP)
