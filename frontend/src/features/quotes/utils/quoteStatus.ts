import type { QuoteStatus } from "@/features/quotes/types/quote.types";

// Keep this list aligned with CLOSED_QUOTE_STATUSES in quotePreview.helpers.ts
// until quote status groupings are centralized in a shared domain module.
const EDITABLE_QUOTE_STATUSES = new Set<QuoteStatus>(["draft", "ready"]);

export function isQuoteEditableStatus(status: QuoteStatus): boolean {
  return EDITABLE_QUOTE_STATUSES.has(status);
}
