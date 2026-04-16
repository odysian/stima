import type { PriceStatus } from "@/features/quotes/types/quote.types";

const INCLUDED_NO_CHARGE_PATTERN = /\b(included|no[\s-]?charge|n\/?c|complimentary|at no cost)\b/i;

export function hasIncludedNoChargeLanguage(...parts: Array<string | null | undefined>): boolean {
  return parts.some((part) => typeof part === "string" && INCLUDED_NO_CHARGE_PATTERN.test(part));
}

export function resolvePriceStatus(options: {
  price: number | null;
  priceStatus?: PriceStatus | null;
  description?: string | null;
  details?: string | null;
}): PriceStatus {
  const normalizedStatus = options.priceStatus?.trim().toLowerCase();
  if (normalizedStatus === "priced") {
    return options.price !== null ? "priced" : "unknown";
  }
  if (normalizedStatus === "included" || normalizedStatus === "unknown") {
    return options.price !== null ? "priced" : normalizedStatus;
  }
  if (options.price !== null) {
    return "priced";
  }
  if (hasIncludedNoChargeLanguage(options.description, options.details)) {
    return "included";
  }
  return "unknown";
}

export function getPriceStatusLabel(options: {
  price: number | null;
  priceStatus?: PriceStatus | null;
  description?: string | null;
  details?: string | null;
}): string {
  const resolvedStatus = resolvePriceStatus(options);
  if (resolvedStatus === "priced" && options.price !== null) {
    return `$${options.price.toFixed(2)}`;
  }
  if (resolvedStatus === "included") {
    return "Included";
  }
  return "TBD";
}
