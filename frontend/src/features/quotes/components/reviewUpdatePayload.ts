import type { QuoteEditDraft } from "@/features/quotes/hooks/useQuoteEdit";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { LineItemDraft } from "@/features/quotes/types/quote.types";
import { normalizeOptionalTitle } from "@/features/quotes/utils/normalizeOptionalTitle";
import { getPricingValidationMessage } from "@/shared/lib/pricing";

type ReviewUpdatePayload = Parameters<typeof quoteService.updateQuote>[1];

export function buildReviewUpdatePayload(options: {
  draft: QuoteEditDraft;
  lineItemsForSubmit: LineItemDraft[];
  hasInvalidLineItems: boolean;
}): {
  payload: ReviewUpdatePayload | null;
  validationMessage: string | null;
} {
  const { draft, lineItemsForSubmit, hasInvalidLineItems } = options;

  if (lineItemsForSubmit.length === 0) {
    return {
      payload: null,
      validationMessage: "Add at least one line item description before saving the quote.",
    };
  }

  if (hasInvalidLineItems) {
    return {
      payload: null,
      validationMessage: "Each line item with details or price needs a description.",
    };
  }

  const pricingError = getPricingValidationMessage({
    totalAmount: draft.total,
    taxRate: draft.taxRate,
    discountType: draft.discountType,
    discountValue: draft.discountValue,
    depositAmount: draft.depositAmount,
  });

  if (pricingError) {
    return {
      payload: null,
      validationMessage: pricingError,
    };
  }

  return {
    payload: {
      title: normalizeOptionalTitle(draft.title),
      transcript: draft.transcript ?? "",
      line_items: lineItemsForSubmit,
      total_amount: draft.total,
      tax_rate: draft.taxRate,
      discount_type: draft.discountType,
      discount_value: draft.discountValue,
      deposit_amount: draft.depositAmount,
      notes: draft.notes.trim().length > 0 ? draft.notes.trim() : null,
    },
    validationMessage: null,
  };
}
