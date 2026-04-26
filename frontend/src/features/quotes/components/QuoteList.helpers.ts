import type { InvoiceListItem } from "@/features/invoices/types/invoice.types";
import { LOCAL_STORAGE_RESET_MESSAGE } from "@/features/quotes/offline/captureDb";
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

function isAuthTransitionError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("csrf")
    || normalized.includes("unauthorized")
    || normalized.includes("forbidden")
    || normalized.includes("auth")
    || normalized.includes("sign in")
  );
}

export function buildPendingCaptureError(params: {
  authMode: "verified" | "offline_recovered" | "signed_out";
  recoverableCapturesError: string | null;
  pendingCaptureActionError: string | null;
}): string | null {
  const combinedError = params.recoverableCapturesError ?? params.pendingCaptureActionError;
  if (!combinedError) {
    return null;
  }
  if (params.authMode !== "verified") {
    if (combinedError === LOCAL_STORAGE_RESET_MESSAGE || isAuthTransitionError(combinedError)) {
      return null;
    }
  }
  return combinedError;
}
