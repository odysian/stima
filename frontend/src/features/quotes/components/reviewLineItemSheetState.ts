import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { syncDraftTotalWithLineItems } from "@/features/quotes/utils/lineItemDraftTotals";
import { DOCUMENT_LINE_ITEMS_MAX_ITEMS } from "@/shared/lib/inputLimits";

interface DraftWithLineItems {
  lineItems: LineItemDraftWithFlags[];
  total: number | null;
}

export type ReviewLineItemSheetState =
  | { mode: "add" }
  | { mode: "edit"; index: number };

export function resolveLineItemSheetInitialItem(
  draft: DraftWithLineItems,
  sheetState: ReviewLineItemSheetState,
  emptyLineItem: LineItemDraftWithFlags,
): LineItemDraftWithFlags {
  if (sheetState.mode === "add") {
    return emptyLineItem;
  }
  return draft.lineItems[sheetState.index] ?? emptyLineItem;
}

export function applyLineItemSheetSave<TDraft extends DraftWithLineItems>(
  draft: TDraft,
  sheetState: ReviewLineItemSheetState,
  nextLineItem: LineItemDraftWithFlags,
): TDraft {
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

export function applyLineItemSheetDelete<TDraft extends DraftWithLineItems>(
  draft: TDraft,
  sheetState: ReviewLineItemSheetState,
): TDraft {
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
