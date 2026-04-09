import type { QuoteEditDraft } from "@/features/quotes/hooks/useQuoteEdit";
import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { DOCUMENT_LINE_ITEMS_MAX_ITEMS } from "@/shared/lib/inputLimits";
import { resolveLineItemSum } from "@/shared/lib/pricing";

export type ReviewLineItemSheetState =
  | { mode: "add" }
  | { mode: "edit"; index: number };

export function resolveLineItemSheetInitialItem(
  draft: QuoteEditDraft,
  sheetState: ReviewLineItemSheetState,
  emptyLineItem: LineItemDraftWithFlags,
): LineItemDraftWithFlags {
  if (sheetState.mode === "add") {
    return emptyLineItem;
  }
  return draft.lineItems[sheetState.index] ?? emptyLineItem;
}

export function applyLineItemSheetSave(
  draft: QuoteEditDraft,
  sheetState: ReviewLineItemSheetState,
  nextLineItem: LineItemDraftWithFlags,
): QuoteEditDraft {
  if (sheetState.mode === "edit") {
    if (sheetState.index < 0 || sheetState.index >= draft.lineItems.length) {
      return draft;
    }

    const nextLineItems = draft.lineItems.map((lineItem, index) =>
      (index === sheetState.index ? nextLineItem : lineItem));

    return {
      ...draft,
      lineItems: nextLineItems,
      total: syncDraftTotalWithLineItems(draft, nextLineItems),
    };
  }

  if (draft.lineItems.length >= DOCUMENT_LINE_ITEMS_MAX_ITEMS) {
    return draft;
  }

  const nextLineItems = [...draft.lineItems, nextLineItem];

  return {
    ...draft,
    lineItems: nextLineItems,
    total: syncDraftTotalWithLineItems(draft, nextLineItems),
  };
}

export function applyLineItemSheetDelete(
  draft: QuoteEditDraft,
  sheetState: ReviewLineItemSheetState,
): QuoteEditDraft {
  if (sheetState.mode !== "edit" || sheetState.index < 0 || sheetState.index >= draft.lineItems.length) {
    return draft;
  }

  const nextLineItems = draft.lineItems.filter((_, index) => index !== sheetState.index);
  return {
    ...draft,
    lineItems: nextLineItems,
    total: syncDraftTotalWithLineItems(draft, nextLineItems),
  };
}

function syncDraftTotalWithLineItems(
  currentDraft: QuoteEditDraft,
  nextLineItems: LineItemDraftWithFlags[],
): number | null {
  const currentDerivedSubtotal = resolveFullyPricedLineItemSum(currentDraft.lineItems);
  if (currentDerivedSubtotal !== currentDraft.total) {
    return currentDraft.total;
  }

  const nextDerivedSubtotal = resolveFullyPricedLineItemSum(nextLineItems);
  if (nextDerivedSubtotal === null) {
    return hasSubstantiveLineItems(nextLineItems) ? currentDraft.total : null;
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
