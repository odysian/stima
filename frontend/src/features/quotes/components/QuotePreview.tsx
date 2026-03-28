import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { QuoteDetailsCard } from "@/features/quotes/components/QuoteDetailsCard";
import { QuoteLineItemsSection } from "@/features/quotes/components/QuoteLineItemsSection";
import { QuotePreviewActions } from "@/features/quotes/components/QuotePreviewActions";
import { ShareLinkRow } from "@/features/quotes/components/ShareLinkRow";
import { QuoteStatusSummaryCard } from "@/features/quotes/components/QuoteStatusSummaryCard";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteDetail, QuoteStatus } from "@/features/quotes/types/quote.types";
import { BottomNav } from "@/shared/components/BottomNav";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { StatusBadge } from "@/shared/components/StatusBadge";

type QuotePreviewCardState = QuoteStatus;
type QuotePreviewActionState = QuoteStatus;

const CLOSED_QUOTE_STATUSES = new Set<QuoteStatus>([
  "shared",
  "viewed",
  "approved",
  "declined",
]);

const SHAREABLE_QUOTE_STATUSES = new Set<QuoteStatus>(["shared", "viewed"]);

function isShareAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function readOptionalQuoteText(
  quote: QuoteDetail | null,
  key: "customer_name" | "customer_email" | "customer_phone" | "title",
): string | null {
  const value = quote?.[key];
  if (typeof value !== "string") return null;
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function QuotePreview(): React.ReactElement {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isMarkingWon, setIsMarkingWon] = useState(false);
  const [isMarkingLost, setIsMarkingLost] = useState(false);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMarkLostConfirm, setShowMarkLostConfirm] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoadError("Missing quote id.");
      setIsLoadingQuote(false);
      return;
    }
    const quoteId = id;
    let isActive = true;

    async function fetchQuote(): Promise<void> {
      setIsLoadingQuote(true);
      setLoadError(null);
      try {
        const fetchedQuote = await quoteService.getQuote(quoteId);
        if (isActive) setQuote(fetchedQuote);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load quote";
        if (isActive) setLoadError(message);
      } finally {
        if (isActive) setIsLoadingQuote(false);
      }
    }

    void fetchQuote();
    return () => { isActive = false; };
  }, [id]);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const canShare = !!quote && !!pdfUrl;
  const apiBase = import.meta.env.VITE_API_URL || window.location.origin;
  const shareUrl = quote?.share_token ? `${apiBase}/share/${quote.share_token}` : null;
  const hasLocalPdf = Boolean(pdfUrl);
  const isShareableStatus = quote ? SHAREABLE_QUOTE_STATUSES.has(quote.status) : false;
  const isClosedStatus = quote ? CLOSED_QUOTE_STATUSES.has(quote.status) : false;
  const cardState: QuotePreviewCardState = quote?.status === "shared"
    || quote?.status === "viewed"
    || quote?.status === "approved"
    || quote?.status === "declined"
    ? quote.status
    : quote?.status === "ready" || hasLocalPdf
      ? "ready"
      : "draft";
  const actionState: QuotePreviewActionState = quote?.status === "shared"
    || quote?.status === "viewed"
    || quote?.status === "approved"
    || quote?.status === "declined"
    ? quote.status
    : canShare
      ? "ready"
      : "draft";
  // Card messaging follows persisted quote status, while actions depend on whether
  // this device has a locally generated PDF blob available right now.
  const openPdfUrl = pdfUrl;
  const quoteTitle = readOptionalQuoteText(quote, "title");
  const customerNameForHeader = readOptionalQuoteText(quote, "customer_name");
  const clientName = readOptionalQuoteText(quote, "customer_name") ?? quote?.customer_id ?? "Unknown customer";
  const clientContact =
    [readOptionalQuoteText(quote, "customer_email"), readOptionalQuoteText(quote, "customer_phone")]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join(" \u00b7 ") || "No contact details";

  async function onGeneratePdf(): Promise<void> {
    if (!id) {
      return;
    }

    setPdfError(null);
    setShareError(null);
    setShareMessage(null);
    setIsGeneratingPdf(true);
    try {
      const blob = await quoteService.generatePdf(id);
      const nextPdfUrl = URL.createObjectURL(blob);
      setPdfUrl((currentPdfUrl) => {
        if (currentPdfUrl) URL.revokeObjectURL(currentPdfUrl);
        return nextPdfUrl;
      });
      setQuote((currentQuote) => {
        if (
          !currentQuote
          || currentQuote.status === "shared"
          || currentQuote.status === "viewed"
          || currentQuote.status === "approved"
          || currentQuote.status === "declined"
        ) {
          return currentQuote;
        }
        return { ...currentQuote, status: "ready" };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate PDF";
      setPdfError(message);
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  async function onShare(): Promise<void> {
    if (!id || !quote) {
      return;
    }
    setShareError(null);
    setShareMessage(null);
    setIsSharing(true);

    try {
      const updatedQuote = await quoteService.shareQuote(id);
      setQuote((currentQuote) => {
        if (!currentQuote) return currentQuote;
        return {
          ...currentQuote,
          title: updatedQuote.title,
          status: updatedQuote.status,
          shared_at: updatedQuote.shared_at,
          share_token: updatedQuote.share_token,
          updated_at: updatedQuote.updated_at,
        };
      });

      if (!updatedQuote.share_token) {
        throw new Error("Share link unavailable");
      }
      const nextSharedUrl = `${apiBase}/share/${updatedQuote.share_token}`;
      const maybeNavigator = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };

      if (typeof maybeNavigator.share === "function") {
        await maybeNavigator.share({
          title: updatedQuote.title ?? `Quote ${updatedQuote.doc_number}`,
          url: nextSharedUrl,
        });
        setShareMessage("Quote link shared.");
        return;
      }
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(nextSharedUrl);
        setShareMessage("Share link copied to clipboard.");
        return;
      }
      setShareMessage("Share this link with your customer.");
    } catch (error) {
      if (isShareAbortError(error)) return;
      const message = error instanceof Error ? error.message : "Unable to share quote";
      setShareError(message);
    } finally {
      setIsSharing(false);
    }
  }

  async function refetchQuote(quoteId: string): Promise<void> {
    const refreshedQuote = await quoteService.getQuote(quoteId);
    setQuote(refreshedQuote);
  }

  async function copyToClipboard(): Promise<void> {
    if (!shareUrl) {
      return;
    }
    setShareError(null);
    setShareMessage(null);
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
      setShareMessage("Copy this share link manually.");
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareMessage("Share link copied to clipboard.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to copy share link";
      setShareError(message);
    }
  }

  async function onMarkWon(): Promise<void> {
    if (!id || !quote) {
      return;
    }

    setOutcomeError(null);
    setShareError(null);
    setShareMessage(null);
    setIsMarkingWon(true);
    try {
      await quoteService.markQuoteWon(id);
      await refetchQuote(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to mark quote as won";
      setOutcomeError(message);
    } finally {
      setIsMarkingWon(false);
    }
  }

  async function onConfirmMarkLost(): Promise<void> {
    if (!id || !quote) {
      return;
    }

    setOutcomeError(null);
    setShareError(null);
    setShareMessage(null);
    setShowMarkLostConfirm(false);
    setIsMarkingLost(true);
    try {
      await quoteService.markQuoteLost(id);
      await refetchQuote(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to mark quote as lost";
      setOutcomeError(message);
    } finally {
      setIsMarkingLost(false);
    }
  }

  async function onDelete(): Promise<void> {
    if (!id || !quote) {
      return;
    }

    setDeleteError(null);
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    try {
      await quoteService.deleteQuote(id);
      navigate("/", { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete quote";
      setDeleteError(message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-24 pt-16">
      <ScreenHeader
        title={quoteTitle ?? customerNameForHeader ?? quote?.doc_number ?? "Quote Preview"}
        subtitle={quoteTitle || customerNameForHeader ? quote?.doc_number : undefined}
        onBack={() => navigate(-1)}
        trailing={quote ? <StatusBadge variant={quote.status} /> : null}
      />

      <section className="mx-auto w-full max-w-6xl">
        {isLoadingQuote ? <p role="status" className="mt-4 px-4 text-sm text-on-surface-variant">Loading quote...</p> : null}

        {loadError ? (
          <div className="mx-4 mt-4">
            <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
          </div>
        ) : null}

        {!isLoadingQuote && !loadError ? (
          <>
            {quote && cardState !== "draft" ? (
              <QuoteStatusSummaryCard
                cardState={cardState}
                hasLocalPdf={hasLocalPdf}
                statusVariant={quote.status}
              />
            ) : null}

            <QuotePreviewActions
              actionState={actionState}
              onGeneratePdf={onGeneratePdf}
              onShare={onShare}
              onCopyShareLink={copyToClipboard}
              onMarkWon={onMarkWon}
              onRequestMarkLost={() => setShowMarkLostConfirm(true)}
              openPdfUrl={openPdfUrl}
              shareUrl={shareUrl}
              isGeneratingPdf={isGeneratingPdf}
              isSharing={isSharing}
              isMarkingWon={isMarkingWon}
              isMarkingLost={isMarkingLost}
              disabled={isLoadingQuote || !!loadError}
              pdfError={pdfError}
              shareError={shareError}
              outcomeError={outcomeError}
              shareMessage={shareMessage}
            />

            {shareUrl && isShareableStatus ? (
              <ShareLinkRow shareUrl={shareUrl} onCopy={copyToClipboard} />
            ) : null}
            {quote ? <QuoteDetailsCard totalAmount={quote.total_amount} clientName={clientName} clientContact={clientContact} /> : null}
            {quote ? <QuoteLineItemsSection lineItems={quote.line_items} /> : null}

            {quote && id && !isClosedStatus ? (
              <div className="mt-3 px-4">
                <button
                  type="button"
                  onClick={() => navigate(`/quotes/${id}/edit`)}
                  className="w-full rounded-lg border border-outline-variant py-4 font-semibold text-on-surface-variant transition-all active:scale-[0.98]"
                >
                  Edit Quote
                </button>
              </div>
            ) : null}

            {quote && !isClosedStatus ? (
              <div className="mt-3 px-4">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full rounded-lg py-3 text-sm text-error transition-all active:scale-[0.98]"
                  disabled={isDeleting}
                >
                  {isDeleting ? "Deleting..." : "Delete Quote"}
                </button>
                {deleteError ? (
                  <div className="mt-3">
                    <FeedbackMessage variant="error">{deleteError}</FeedbackMessage>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {showDeleteConfirm && quote ? (
        <ConfirmModal
          title={`Delete ${quote.title ?? quote.doc_number}?`}
          body="This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Keep"
          variant="destructive"
          onConfirm={() => void onDelete()}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      ) : null}

      {showMarkLostConfirm ? (
        <ConfirmModal
          title="Mark quote as lost?"
          body="This records the quote as lost. You can still view the quote and its PDF."
          confirmLabel="Mark as Lost"
          cancelLabel="Cancel"
          variant="destructive"
          onConfirm={() => void onConfirmMarkLost()}
          onCancel={() => setShowMarkLostConfirm(false)}
        />
      ) : null}

      <BottomNav active="quotes" />
    </main>
  );
}
