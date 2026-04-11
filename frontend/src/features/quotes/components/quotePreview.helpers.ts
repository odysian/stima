import type { QuoteDetail, QuoteStatus } from "@/features/quotes/types/quote.types";
import type { OverflowMenuItem } from "@/shared/components/OverflowMenu";
import { isHttpRequestError } from "@/shared/lib/http";

export type QuotePreviewActionState = QuoteStatus;

const DEGRADED_REASON_COPY: Record<string, string> = {
  provider_retryable_error:
    "We saved your transcript, but line item extraction was temporarily unavailable. Please review and complete this draft before sharing.",
};

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

export function resolveExtractionDegradedCopy(quote: QuoteDetail | null): string | null {
  if (!quote || quote.extraction_tier !== "degraded") {
    return null;
  }
  if (!quote.extraction_degraded_reason_code) {
    return "We saved your transcript, but extraction quality was degraded. Please review this draft before sharing.";
  }
  return (
    DEGRADED_REASON_COPY[quote.extraction_degraded_reason_code]
    ?? "We saved your transcript, but extraction quality was degraded. Please review this draft before sharing."
  );
}

export function resolveActionState(
  quote: QuoteDetail | null,
): QuotePreviewActionState {
  if (
    quote?.status === "shared"
    || quote?.status === "viewed"
    || quote?.status === "approved"
    || quote?.status === "declined"
  ) {
    return quote.status;
  }

  if (quote?.status === "ready") {
    return "ready";
  }

  return "draft";
}
export function getEmailActionLabel(
  actionState: QuotePreviewActionState,
  hasActiveShare: boolean,
): string | null {
  if (actionState === "ready") {
    return "Send Email";
  }
  if (
    actionState === "shared"
    || actionState === "viewed"
    || actionState === "approved"
    || actionState === "declined"
  ) {
    return hasActiveShare ? "Resend Email" : "Send Email";
  }
  return null;
}
export function getSendEmailErrorMessage(error: unknown): string {
  const fallbackMessage = error instanceof Error ? error.message : "Unable to send quote email";
  const status = (
    isHttpRequestError(error)
    || (
      typeof error === "object"
      && error !== null
      && "status" in error
      && typeof (error as { status?: unknown }).status === "number"
    )
  )
    ? (error as { status: number }).status
    : null;

  if (status !== null) {
    switch (status) {
      case 404:
        return "This quote could not be found. Refresh and try again.";
      case 409:
        return fallbackMessage;
      case 422:
        return "Add a valid customer email before sending this quote.";
      case 429:
        return "This quote was emailed recently. Please wait a few minutes before resending.";
      case 502:
        return "Email delivery failed. Please try again.";
      case 503:
        return fallbackMessage || "Unable to start email delivery right now. Please try again.";
      default:
        break;
    }
  }

  return fallbackMessage;
}

interface BuildOverflowItemsArgs {
  hasQuote: boolean;
  hasActiveShare: boolean;
  actionState: QuotePreviewActionState;
  isBusy: boolean;
  onRevokeShareRequest: () => void;
  onDeleteRequest: () => void;
  onMarkWonRequest: () => void;
  onMarkLostRequest: () => void;
}

export function buildOverflowItems({
  hasQuote,
  hasActiveShare,
  actionState,
  isBusy,
  onRevokeShareRequest,
  onDeleteRequest,
  onMarkWonRequest,
  onMarkLostRequest,
}: BuildOverflowItemsArgs): OverflowMenuItem[] {
  if (!hasQuote) {
    return [];
  }

  let items: OverflowMenuItem[] = [];

  if (actionState === "draft") {
    items = [
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
  } else if (actionState === "ready") {
    items = [
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
  } else if (
    actionState === "shared"
    || actionState === "viewed"
    || actionState === "approved"
    || actionState === "declined"
  ) {
    items = [
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

  if (hasActiveShare) {
    items.unshift({
      label: "Revoke Link",
      icon: "link_off",
      tone: "destructive",
      disabled: isBusy,
      onSelect: onRevokeShareRequest,
    });
  }

  return items;
}
