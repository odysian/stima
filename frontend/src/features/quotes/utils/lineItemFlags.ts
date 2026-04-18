export const SPOKEN_MONEY_CORRECTION_FLAG_REASON = "spoken_money_correction";

export function resolveLineItemFlagMessage(flagReason: string | null | undefined): string {
  const normalizedReason = flagReason?.trim();
  if (normalizedReason === SPOKEN_MONEY_CORRECTION_FLAG_REASON) {
    return "Spoken amount was interpreted as dollars instead of cents.";
  }
  return normalizedReason || "This item may need review";
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
