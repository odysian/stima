import type { QuoteDetail, QuoteStatus } from "@/features/quotes/types/quote.types";
import type { OverflowMenuItem } from "@/shared/components/OverflowMenu";
import { formatDate } from "@/shared/lib/formatters";

export type QuotePreviewActionState = QuoteStatus;

export const CLOSED_QUOTE_STATUSES = new Set<QuoteStatus>([
  "shared",
  "viewed",
  "approved",
  "declined",
]);

export interface QuotePreviewStatusRowModel {
  icon: string;
  iconClasses: string;
  text: string;
  timestamp: string | null;
  timestampLabel?: string;
  timestampValue?: string;
}

export function isShareAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export function readOptionalQuoteText(
  quote: QuoteDetail | null,
  key: "customer_name" | "customer_email" | "customer_phone" | "title",
): string | null {
  const value = quote?.[key];
  if (typeof value !== "string") return null;
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function canNavigateBack(): boolean {
  const historyState = window.history.state as { idx?: number } | null;
  if (typeof historyState?.idx === "number") {
    return historyState.idx > 0;
  }
  return window.history.length > 1;
}

export function getCompactStatusRow(
  actionState: QuotePreviewActionState,
  quote: QuoteDetail | null,
  hasLocalPdf: boolean,
): QuotePreviewStatusRowModel | null {
  if (actionState === "draft" || !quote) {
    return null;
  }

  if (actionState === "ready") {
    return {
      icon: "description",
      iconClasses: "bg-success-container text-success",
      text: hasLocalPdf ? "PDF generated on this device" : "Quote ready to share",
      timestamp: null,
    };
  }

  if (actionState === "shared") {
    const timestampValue = quote.shared_at ?? quote.updated_at;
    return {
      icon: "ios_share",
      iconClasses: "bg-info-container text-info",
      text: "Quote shared",
      timestamp: formatDate(timestampValue),
      timestampLabel: "Shared",
      timestampValue,
    };
  }

  // The quote schema does not store dedicated viewed/won/lost transition timestamps yet,
  // so updated_at is the best available proxy for when these states were recorded.
  if (actionState === "viewed") {
    return {
      icon: "visibility",
      iconClasses: "bg-warning-container text-warning",
      text: "Customer viewed this quote",
      timestamp: formatDate(quote.updated_at),
      timestampLabel: "Viewed",
      timestampValue: quote.updated_at,
    };
  }

  if (actionState === "approved") {
    return {
      icon: "check_circle",
      iconClasses: "bg-success-container text-success",
      text: "Quote marked as won",
      timestamp: formatDate(quote.updated_at),
      timestampLabel: "Approved",
      timestampValue: quote.updated_at,
    };
  }

  return {
    icon: "cancel",
    iconClasses: "bg-error-container text-error",
    text: "Quote marked as lost",
    timestamp: formatDate(quote.updated_at),
    timestampLabel: "Declined",
    timestampValue: quote.updated_at,
  };
}

interface BuildOverflowItemsArgs {
  hasQuote: boolean;
  actionState: QuotePreviewActionState;
  openPdfUrl: string | null;
  shareUrl: string | null;
  isBusy: boolean;
  onDeleteRequest: () => void;
  onCopyShareLink: () => void;
  onMarkWonRequest: () => void;
  onMarkLostRequest: () => void;
}

export function buildOverflowItems({
  hasQuote,
  actionState,
  openPdfUrl,
  shareUrl,
  isBusy,
  onDeleteRequest,
  onCopyShareLink,
  onMarkWonRequest,
  onMarkLostRequest,
}: BuildOverflowItemsArgs): OverflowMenuItem[] {
  if (!hasQuote) {
    return [];
  }

  if (actionState === "draft") {
    return [
      {
        label: "Delete Quote",
        icon: "delete",
        tone: "destructive",
        disabled: isBusy,
        onSelect: onDeleteRequest,
      },
    ];
  }

  if (actionState === "ready") {
    return [
      {
        label: "Open PDF",
        icon: "open_in_new",
        href: openPdfUrl ?? undefined,
        openInNewTab: true,
        disabled: !openPdfUrl,
      },
      {
        label: "Delete Quote",
        icon: "delete",
        tone: "destructive",
        disabled: isBusy,
        onSelect: onDeleteRequest,
      },
    ];
  }

  if (actionState === "shared" || actionState === "viewed") {
    return [
      {
        label: "Copy Share Link",
        icon: "content_copy",
        disabled: !shareUrl || isBusy,
        onSelect: onCopyShareLink,
      },
      {
        label: "Mark as Won",
        icon: "check_circle",
        disabled: isBusy,
        onSelect: onMarkWonRequest,
      },
      {
        label: "Mark as Lost",
        icon: "cancel",
        tone: "destructive",
        disabled: isBusy,
        onSelect: onMarkLostRequest,
      },
    ];
  }

  return [];
}
