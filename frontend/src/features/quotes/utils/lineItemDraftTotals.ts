import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { resolvePriceStatus } from "@/features/quotes/utils/priceStatus";
import { resolveLineItemSum } from "@/shared/lib/pricing";

interface DraftLineItemTotalsState {
  lineItems: LineItemDraftWithFlags[];
  total: number | null;
}

export interface LineItemAuthoritativeSubtotal {
  definesSubtotal: boolean;
  subtotal: number | null;
}

export function syncDraftTotalWithLineItems(
  currentState: DraftLineItemTotalsState,
  nextLineItems: LineItemDraftWithFlags[],
): number | null {
  const currentDerivedSubtotal = resolveLineItemAuthoritativeSubtotal(currentState.lineItems);
  if (currentState.total !== null && !currentDerivedSubtotal.definesSubtotal) {
    return currentState.total;
  }
  if (!isSameMoneyValue(currentDerivedSubtotal.subtotal, currentState.total)) {
    return currentState.total;
  }

  const nextDerivedSubtotal = resolveLineItemAuthoritativeSubtotal(nextLineItems);
  if (!nextDerivedSubtotal.definesSubtotal) {
    return currentState.total;
  }
  return nextDerivedSubtotal.subtotal;
}

export function resolveLineItemAuthoritativeSubtotal(
  lineItems: LineItemDraftWithFlags[],
): LineItemAuthoritativeSubtotal {
  const substantiveLineItems = lineItems.filter(hasLineItemContent);
  if (substantiveLineItems.length === 0) {
    return { definesSubtotal: true, subtotal: null };
  }

  const pricedValues: number[] = [];
  for (const lineItem of substantiveLineItems) {
    const priceStatus = resolvePriceStatus({
      price: lineItem.price,
      priceStatus: lineItem.priceStatus,
      description: lineItem.description,
      details: lineItem.details,
    });
    if (priceStatus === "unknown") {
      return { definesSubtotal: false, subtotal: null };
    }
    if (priceStatus === "priced" && lineItem.price !== null) {
      pricedValues.push(lineItem.price);
    }
  }
  return { definesSubtotal: true, subtotal: resolveLineItemSum(pricedValues) };
}

function hasLineItemContent(lineItem: LineItemDraftWithFlags): boolean {
  return (
    lineItem.description.trim().length > 0
    || (lineItem.details?.trim().length ?? 0) > 0
    || lineItem.price !== null
  );
}

function isSameMoneyValue(left: number | null, right: number | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return Math.round(left * 100) === Math.round(right * 100);
}
