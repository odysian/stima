import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { shouldClearSpokenMoneyFlagOnPriceEdit } from "@/features/quotes/utils/lineItemFlags";
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

    const previousLineItem = draft.lineItems[sheetState.index];
    const normalizedNextLineItem = shouldClearSpokenMoneyFlagOnPriceEdit({
      previousFlagged: previousLineItem?.flagged,
      previousFlagReason: previousLineItem?.flagReason,
      previousPrice: previousLineItem?.price ?? null,
      nextPrice: nextLineItem.price,
    })
      ? {
          ...nextLineItem,
          flagged: false,
          flagReason: null,
        }
      : nextLineItem;

    const nextLineItems = draft.lineItems.map((lineItem, index) =>
      (index === sheetState.index ? normalizedNextLineItem : lineItem));

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

export function applyLineItemReorder<TDraft extends DraftWithLineItems>(
  draft: TDraft,
  sourceIndex: number,
  targetIndex: number,
): TDraft {
  if (
    sourceIndex === targetIndex
    || sourceIndex < 0
    || targetIndex < 0
    || sourceIndex >= draft.lineItems.length
    || targetIndex >= draft.lineItems.length
  ) {
    return draft;
  }

  const nextLineItems = [...draft.lineItems];
  const [movedLineItem] = nextLineItems.splice(sourceIndex, 1);
  if (!movedLineItem) {
    return draft;
  }
  nextLineItems.splice(targetIndex, 0, movedLineItem);

  return {
    ...draft,
    lineItems: nextLineItems,
    total: syncDraftTotalWithLineItems(draft, nextLineItems),
  };
}
