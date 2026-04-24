import type { QuoteDetail, QuoteSourceType } from "@/features/quotes/types/quote.types";

interface BuildDraftFromQuoteDetailParams {
  sourceType: QuoteSourceType;
  quoteDetail: QuoteDetail;
  quoteId: string;
  customerId: string | undefined;
  launchOrigin: string;
}

export function buildDraftFromQuoteDetail({
  sourceType,
  quoteDetail,
  quoteId,
  customerId,
  launchOrigin,
}: BuildDraftFromQuoteDetailParams) {
  return {
    quoteId,
    customerId: quoteDetail.customer_id ?? customerId ?? "",
    launchOrigin,
    title: "",
    transcript: quoteDetail.transcript,
    lineItems: quoteDetail.line_items.map((lineItem) => ({
      description: lineItem.description,
      details: lineItem.details,
      price: lineItem.price,
      flagged: lineItem.flagged,
      flagReason: lineItem.flag_reason,
    })),
    total: quoteDetail.total_amount,
    taxRate: quoteDetail.tax_rate,
    discountType: quoteDetail.discount_type,
    discountValue: quoteDetail.discount_value,
    depositAmount: quoteDetail.deposit_amount,
    notes: quoteDetail.notes ?? "",
    sourceType,
  };
}
