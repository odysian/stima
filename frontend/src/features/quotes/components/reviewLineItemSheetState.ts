import type { QuoteEditDraft } from "@/features/quotes/hooks/useQuoteEdit";
import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { DOCUMENT_LINE_ITEMS_MAX_ITEMS } from "@/shared/lib/inputLimits";

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

    return {
      ...draft,
      lineItems: draft.lineItems.map((lineItem, index) => (index === sheetState.index ? nextLineItem : lineItem)),
    };
  }

  if (draft.lineItems.length >= DOCUMENT_LINE_ITEMS_MAX_ITEMS) {
    return draft;
  }

  return {
    ...draft,
    lineItems: [...draft.lineItems, nextLineItem],
  };
}
