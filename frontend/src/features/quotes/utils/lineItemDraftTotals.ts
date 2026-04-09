import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { resolveLineItemSum } from "@/shared/lib/pricing";

interface DraftLineItemTotalsState {
  lineItems: LineItemDraftWithFlags[];
  total: number | null;
}

export function syncDraftTotalWithLineItems(
  currentState: DraftLineItemTotalsState,
  nextLineItems: LineItemDraftWithFlags[],
): number | null {
  const currentDerivedSubtotal = resolveFullyPricedLineItemSum(currentState.lineItems);
  if (currentDerivedSubtotal !== currentState.total) {
    return currentState.total;
  }

  const nextDerivedSubtotal = resolveFullyPricedLineItemSum(nextLineItems);
  if (nextDerivedSubtotal === null) {
    return hasSubstantiveLineItems(nextLineItems) ? currentState.total : null;
  }
  return nextDerivedSubtotal;
}

function resolveFullyPricedLineItemSum(lineItems: LineItemDraftWithFlags[]): number | null {
  const substantiveLineItems = lineItems.filter(hasLineItemContent);
  if (substantiveLineItems.length === 0) {
    return null;
  }
  if (substantiveLineItems.some((lineItem) => lineItem.price === null)) {
    return null;
  }
  return resolveLineItemSum(substantiveLineItems.map((lineItem) => lineItem.price));
}

function hasSubstantiveLineItems(lineItems: LineItemDraftWithFlags[]): boolean {
  return lineItems.some(hasLineItemContent);
}

function hasLineItemContent(lineItem: LineItemDraftWithFlags): boolean {
  return (
    lineItem.description.trim().length > 0
    || (lineItem.details?.trim().length ?? 0) > 0
    || lineItem.price !== null
  );
}
