export const SPOKEN_MONEY_CORRECTION_FLAG_REASON = "spoken_money_correction";
const DEFAULT_FLAG_MESSAGE = "This item may need review";
const DEFAULT_REVIEW_EXPLANATION = "Review this line item before continuing.";

export function resolveLineItemFlagMessage(flagReason: string | null | undefined): string {
  const normalizedReason = flagReason?.trim();
  if (normalizedReason === SPOKEN_MONEY_CORRECTION_FLAG_REASON) {
    return "Spoken amount was interpreted as dollars instead of cents.";
  }
  return normalizedReason || DEFAULT_FLAG_MESSAGE;
}

export function resolveLineItemReviewExplanation(flagReason: string | null | undefined): string {
  const normalizedReason = flagReason?.trim();
  if (normalizedReason === SPOKEN_MONEY_CORRECTION_FLAG_REASON) {
    return "Voice capture may have interpreted cents as dollars. Confirm the amount and update the price if needed.";
  }
  if (normalizedReason) {
    return normalizedReason.endsWith(".") ? normalizedReason : `${normalizedReason}.`;
  }
  return DEFAULT_REVIEW_EXPLANATION;
}

export function shouldClearSpokenMoneyFlagOnPriceEdit(params: {
  previousFlagged?: boolean;
  previousFlagReason?: string | null;
  previousPrice: number | null;
  nextPrice: number | null;
}): boolean {
  const {
    previousFlagged = false,
    previousFlagReason,
    previousPrice,
    nextPrice,
  } = params;
  if (!previousFlagged || previousFlagReason !== SPOKEN_MONEY_CORRECTION_FLAG_REASON) {
    return false;
  }
  if (previousPrice === null || nextPrice === null) {
    return previousPrice !== nextPrice;
  }
  return Math.abs(previousPrice - nextPrice) >= 0.01;
}
