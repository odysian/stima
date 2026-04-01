export type DiscountType = "fixed" | "percent";

export interface PricingFields {
  totalAmount: number | null;
  taxRate: number | null;
  discountType: DiscountType | null;
  discountValue: number | null;
  depositAmount: number | null;
}

export interface PricingBreakdown {
  subtotal: number | null;
  discountType: DiscountType | null;
  discountValue: number | null;
  discountAmount: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  depositAmount: number | null;
  balanceDue: number | null;
  hasPricingBreakdown: boolean;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function hasValue(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && value !== 0;
}

export function normalizePricingFields<T extends PricingFields>(pricing: T): T {
  return {
    ...pricing,
    taxRate: hasValue(pricing.taxRate) ? pricing.taxRate : null,
    discountType: hasValue(pricing.discountValue) ? pricing.discountType : null,
    discountValue: hasValue(pricing.discountValue) ? pricing.discountValue : null,
    depositAmount: hasValue(pricing.depositAmount) ? pricing.depositAmount : null,
  };
}

export function calculatePricingFromSubtotal(pricing: PricingFields): PricingBreakdown {
  const normalized = normalizePricingFields(pricing);
  const subtotal = normalized.totalAmount;
  const discountAmount = calculateDiscountAmount(subtotal, normalized.discountType, normalized.discountValue);
  const taxableSubtotal =
    subtotal !== null ? subtotal - (discountAmount ?? 0) : null;
  const taxAmount =
    taxableSubtotal !== null && normalized.taxRate !== null
      ? roundMoney(taxableSubtotal * normalized.taxRate)
      : null;
  const totalAmount =
    taxableSubtotal !== null ? roundMoney(taxableSubtotal + (taxAmount ?? 0)) : null;
  const balanceDue =
    totalAmount !== null && normalized.depositAmount !== null
      ? roundMoney(totalAmount - normalized.depositAmount)
      : totalAmount;

  return {
    subtotal,
    discountType: normalized.discountType,
    discountValue: normalized.discountValue,
    discountAmount,
    taxRate: normalized.taxRate,
    taxAmount,
    totalAmount,
    depositAmount: normalized.depositAmount,
    balanceDue,
    hasPricingBreakdown: Boolean(discountAmount ?? taxAmount ?? normalized.depositAmount),
  };
}

export function calculatePricingFromPersisted(
  pricing: PricingFields,
  lineItemSum: number | null = null,
): PricingBreakdown {
  const normalized = normalizePricingFields(pricing);
  const subtotal = resolveSubtotalFromPersisted(normalized, lineItemSum);
  const discountAmount = calculateDiscountAmount(subtotal, normalized.discountType, normalized.discountValue);
  const taxableSubtotal =
    subtotal !== null ? subtotal - (discountAmount ?? 0) : null;
  const taxAmount =
    taxableSubtotal !== null && normalized.taxRate !== null
      ? roundMoney(taxableSubtotal * normalized.taxRate)
      : null;
  const balanceDue =
    normalized.totalAmount !== null && normalized.depositAmount !== null
      ? roundMoney(normalized.totalAmount - normalized.depositAmount)
      : normalized.totalAmount;

  return {
    subtotal,
    discountType: normalized.discountType,
    discountValue: normalized.discountValue,
    discountAmount,
    taxRate: normalized.taxRate,
    taxAmount,
    totalAmount: normalized.totalAmount,
    depositAmount: normalized.depositAmount,
    balanceDue,
    hasPricingBreakdown: Boolean(discountAmount ?? taxAmount ?? normalized.depositAmount),
  };
}

export function getPricingValidationMessage(pricing: PricingFields): string | null {
  if (pricing.discountType !== null && pricing.discountValue === null) {
    return "Enter a discount value or turn discount off.";
  }
  if (pricing.discountType === null && pricing.discountValue !== null && pricing.discountValue !== 0) {
    return "Choose a discount type or clear the discount value.";
  }
  if (pricing.discountValue !== null && pricing.discountValue < 0) {
    return "Discount value cannot be negative.";
  }
  if (pricing.discountType === "percent" && pricing.discountValue !== null && pricing.discountValue > 100) {
    return "Percent discount must be between 0 and 100.";
  }
  if (pricing.taxRate !== null && (pricing.taxRate < 0 || pricing.taxRate > 1)) {
    return "Tax rate must be between 0 and 100%.";
  }
  if (pricing.depositAmount !== null && pricing.depositAmount < 0) {
    return "Deposit amount cannot be negative.";
  }
  const hasActivePricing =
    pricing.discountType !== null || pricing.taxRate !== null || pricing.depositAmount !== null;
  if (hasActivePricing && pricing.totalAmount === null) {
    return "Enter a subtotal before using optional pricing.";
  }
  const breakdown = calculatePricingFromSubtotal(pricing);
  if (
    breakdown.subtotal !== null
    && breakdown.discountAmount !== null
    && breakdown.discountAmount > breakdown.subtotal
  ) {
    return "Discount cannot exceed the subtotal.";
  }
  return null;
}

export function resolveLineItemSum(prices: Array<number | null | undefined>): number | null {
  const numericPrices = prices.filter((price): price is number => price !== null && price !== undefined);
  if (numericPrices.length === 0) {
    return null;
  }
  return roundMoney(numericPrices.reduce((sum, price) => sum + price, 0));
}

export function toTaxPercentDisplay(value: number | null): string {
  if (value === null) {
    return "";
  }
  return String(roundMoney(value * 100));
}

export function parseTaxPercentInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed / 100;
}

function calculateDiscountAmount(
  subtotal: number | null,
  discountType: DiscountType | null,
  discountValue: number | null,
): number | null {
  if (subtotal === null || discountType === null || discountValue === null) {
    return null;
  }
  if (discountType === "fixed") {
    return roundMoney(discountValue);
  }
  return roundMoney(subtotal * (discountValue / 100));
}

function resolveSubtotalFromPersisted(
  pricing: PricingFields,
  lineItemSum: number | null,
): number | null {
  if (pricing.totalAmount === null) {
    return lineItemSum;
  }
  if (pricing.discountType === null && pricing.taxRate === null) {
    return pricing.totalAmount;
  }
  const taxMultiplier = 1 + (pricing.taxRate ?? 0);
  if (pricing.discountType === "fixed") {
    return roundMoney(pricing.totalAmount / taxMultiplier + (pricing.discountValue ?? 0));
  }
  if (pricing.discountType === "percent") {
    if (pricing.discountValue === 100) {
      return lineItemSum ?? 0;
    }
    const percentMultiplier = 1 - ((pricing.discountValue ?? 0) / 100);
    return roundMoney(pricing.totalAmount / (taxMultiplier * percentMultiplier));
  }
  return roundMoney(pricing.totalAmount / taxMultiplier);
}
