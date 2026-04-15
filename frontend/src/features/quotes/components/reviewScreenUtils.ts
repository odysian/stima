import type { QuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import type {
  ExtractionResult,
  LineItemDraft,
  LineItemDraftWithFlags,
} from "@/features/quotes/types/quote.types";
import { normalizeOptionalTitle } from "@/features/quotes/utils/normalizeOptionalTitle";

export const EMPTY_LINE_ITEM: LineItemDraftWithFlags = {
  description: "",
  details: null,
  price: null,
};

export function normalizeLineItem(item: LineItemDraftWithFlags): LineItemDraftWithFlags {
  const normalizedDetails = item.details?.trim() ?? "";
  return {
    description: item.description.trim(),
    details: normalizedDetails.length > 0 ? normalizedDetails : null,
    price: item.price,
    flagged: item.flagged,
    flagReason: item.flagReason,
  };
}

function isBlankLineItem(item: LineItemDraftWithFlags): boolean {
  return item.description.length === 0 && item.details === null && item.price === null;
}

export function isInvalidLineItem(item: LineItemDraftWithFlags): boolean {
  return item.description.length === 0 && !isBlankLineItem(item);
}

export function buildLineItemSubmitState(lineItems: LineItemDraftWithFlags[]): {
  hasInvalidLineItems: boolean;
  lineItemsForSubmit: LineItemDraft[];
  lineItemSum: number;
} {
  const normalizedLineItems = lineItems.map(normalizeLineItem);
  const hasInvalidLineItems = normalizedLineItems.some(isInvalidLineItem);
  const lineItemsForSubmit: LineItemDraft[] = normalizedLineItems
    .filter((lineItem) => lineItem.description.length > 0)
    .map((lineItem) => ({
      description: lineItem.description,
      details: lineItem.details,
      price: lineItem.price,
      flagged: lineItem.flagged,
      flag_reason: lineItem.flagReason ?? null,
    }));
  const lineItemSum = normalizedLineItems.reduce((runningTotal, lineItem) => {
    if (lineItem.price === null) {
      return runningTotal;
    }
    return runningTotal + lineItem.price;
  }, 0);

  return {
    hasInvalidLineItems,
    lineItemsForSubmit,
    lineItemSum,
  };
}

export function mapExtractedLineItems(extraction: ExtractionResult): LineItemDraftWithFlags[] {
  return extraction.line_items.map((lineItem) => ({
    description: lineItem.description,
    details: lineItem.details,
    price: lineItem.price,
    flagged: lineItem.flagged,
    flagReason: lineItem.flag_reason,
  }));
}

export function getReviewMessages(draft: QuoteDraft): string[] {
  const flaggedMessages = draft.lineItems.flatMap((lineItem, index) => {
    if (!lineItem.flagged) {
      return [];
    }

    const lineItemLabel = lineItem.description.trim() || `Line item ${index + 1}`;
    const reason = lineItem.flagReason?.trim() || "Needs manual review before generating the quote.";
    return [`${lineItemLabel}: ${reason}`];
  });

  return [...new Set(flaggedMessages)];
}

export function getWarningMessages(
  reviewMessages: string[],
  hasNullPrices: boolean,
  documentType: "quote" | "invoice",
): string[] {
  if (!hasNullPrices) {
    return reviewMessages;
  }

  return [
    ...reviewMessages,
    documentType === "quote"
      ? "Line items without prices will render as \"TBD\" when the quote is shared."
      : "Line items without prices will render as \"TBD\" when the invoice is created.",
  ];
}

export function buildCreatePayload(draft: QuoteDraft, lineItems: LineItemDraft[]) {
  return {
    customer_id: draft.customerId,
    title: normalizeOptionalTitle(draft.title),
    transcript: draft.transcript,
    line_items: lineItems,
    total_amount: draft.total,
    tax_rate: draft.taxRate,
    discount_type: draft.discountType,
    discount_value: draft.discountValue,
    deposit_amount: draft.depositAmount,
    notes: draft.notes,
    source_type: draft.sourceType,
  };
}

export function buildUpdatePayload(draft: QuoteDraft, lineItems: LineItemDraft[]) {
  return {
    title: normalizeOptionalTitle(draft.title),
    transcript: draft.transcript,
    line_items: lineItems,
    total_amount: draft.total,
    tax_rate: draft.taxRate,
    discount_type: draft.discountType,
    discount_value: draft.discountValue,
    deposit_amount: draft.depositAmount,
    notes: draft.notes,
  };
}
