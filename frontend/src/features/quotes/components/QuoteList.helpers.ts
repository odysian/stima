import type { InvoiceListItem } from "@/features/invoices/types/invoice.types";
import type { QuoteListItem } from "@/features/quotes/types/quote.types";

export function matchesSearch(
  item: Pick<QuoteListItem, "customer_name" | "doc_number" | "title">,
  normalizedSearchQuery: string,
): boolean {
  if (!normalizedSearchQuery) {
    return true;
  }
  return (
    (item.customer_name ?? "").toLowerCase().includes(normalizedSearchQuery)
    || item.doc_number.toLowerCase().includes(normalizedSearchQuery)
    || (item.title?.toLowerCase() ?? "").includes(normalizedSearchQuery)
  );
}

export function buildQuoteSubtitle(
  quotes: QuoteListItem[],
  isLoading: boolean,
  loadError: string | null,
): string | undefined {
  if (isLoading || loadError) {
    return undefined;
  }
  const activeQuoteCount = quotes.filter((q) => q.status === "ready" || q.status === "shared").length;
  const pendingReviewCount = quotes.filter((q) => q.status === "draft").length;
  return `${activeQuoteCount} active · ${pendingReviewCount} pending`;
}

export function buildInvoiceSubtitle(
  invoices: InvoiceListItem[],
  isLoading: boolean,
  loadError: string | null,
): string | undefined {
  if (isLoading || loadError) {
    return undefined;
  }
  const activeInvoiceCount = invoices.filter((i) => i.status === "ready" || i.status === "sent").length;
  const pendingInvoiceCount = invoices.filter((i) => i.status === "draft").length;
  return `${activeInvoiceCount} active · ${pendingInvoiceCount} pending`;
}
