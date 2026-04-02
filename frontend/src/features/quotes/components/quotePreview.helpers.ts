import type { QuoteDetail, QuoteStatus } from "@/features/quotes/types/quote.types";
import type { OverflowMenuItem } from "@/shared/components/OverflowMenu";
import { isHttpRequestError } from "@/shared/lib/http";

export type QuotePreviewActionState = QuoteStatus;

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
    return "Send Email";
  }
  if (
    actionState === "shared"
    || actionState === "viewed"
    || actionState === "approved"
    || actionState === "declined"
  ) {
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

  if (actionState === "ready") {
    return [
      {
        label: "Delete Quote",
        icon: "delete",
        tone: "destructive",
        disabled: isBusy,
        onSelect: onDeleteRequest,
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

  if (
    actionState === "shared"
    || actionState === "viewed"
    || actionState === "approved"
    || actionState === "declined"
  ) {
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
