import type { QuoteDetail, QuoteStatus } from "@/features/quotes/types/quote.types";
import type { OverflowMenuItem } from "@/shared/components/OverflowMenu";
import { isHttpRequestError } from "@/shared/lib/http";
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
  // This can step outside the app in rare direct-entry cases where the browser has
  // prior history but React Router did not set idx. We accept that tradeoff here to
  // preserve a sensible back behavior for older/non-router history state entries.
  return window.history.length > 1;
}

export function resolveActionState(
  quote: QuoteDetail | null,
  hasLocalPdf: boolean,
): QuotePreviewActionState {
  if (
    quote?.status === "shared"
    || quote?.status === "viewed"
    || quote?.status === "approved"
    || quote?.status === "declined"
  ) {
    return quote.status;
  }

  if (quote?.status === "ready" || hasLocalPdf) {
    return "ready";
  }

  return "draft";
}


export function getEmailActionLabel(actionState: QuotePreviewActionState): string | null {
  if (actionState === "ready") {
    return "Send by Email";
  }
  if (actionState === "shared" || actionState === "viewed") {
    return "Resend Email";
  }
  return null;
}


export function getSendEmailErrorMessage(error: unknown): string {
  if (isHttpRequestError(error)) {
    switch (error.status) {
      case 404:
        return "This quote could not be found. Refresh and try again.";
      case 409:
        return error.message;
      case 422:
        return "Add a valid customer email before sending this quote.";
      case 429:
        return "This quote was emailed recently. Please wait a few minutes before resending.";
      case 502:
        return "Email delivery failed. Please try again.";
      case 503:
        return "Email delivery is not configured right now.";
      default:
        break;
    }
  }

  return error instanceof Error ? error.message : "Unable to send quote email";
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
  isBusy: boolean;
  onDeleteRequest: () => void;
  onMarkWonRequest: () => void;
  onMarkLostRequest: () => void;
}

export function buildOverflowItems({
  hasQuote,
  actionState,
  isBusy,
  onDeleteRequest,
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
