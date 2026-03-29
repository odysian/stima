import type { QuoteStatus } from "@/features/quotes/types/quote.types";

const EDITABLE_QUOTE_STATUSES = new Set<QuoteStatus>(["draft", "ready"]);

export function isQuoteEditableStatus(status: QuoteStatus): boolean {
  return EDITABLE_QUOTE_STATUSES.has(status);
}
