import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { QuoteDetailsCard } from "@/features/quotes/components/QuoteDetailsCard";
import { QuotePreviewHeaderActions } from "@/features/quotes/components/QuotePreviewHeaderActions";
import { QuoteLineItemsSection } from "@/features/quotes/components/QuoteLineItemsSection";
import { QuotePreviewActions } from "@/features/quotes/components/QuotePreviewActions";
import { QuotePreviewStatusRow } from "@/features/quotes/components/QuotePreviewStatusRow";
import {
  CLOSED_QUOTE_STATUSES,
  buildOverflowItems,
  canNavigateBack,
  getEmailActionLabel,
  getCompactStatusRow,
  getSendEmailErrorMessage,
  isShareAbortError,
  readOptionalQuoteText,
  resolveActionState,
} from "@/features/quotes/components/quotePreview.helpers";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { Quote, QuoteDetail } from "@/features/quotes/types/quote.types";
import { BottomNav } from "@/shared/components/BottomNav";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { ScreenHeader } from "@/shared/components/ScreenHeader";

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
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isMarkingWon, setIsMarkingWon] = useState(false);
  const [isMarkingLost, setIsMarkingLost] = useState(false);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMarkWonConfirm, setShowMarkWonConfirm] = useState(false);
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
        if (isActive) {
          setQuote(fetchedQuote);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load quote";
        if (isActive) {
          setLoadError(message);
        }
      } finally {
        if (isActive) {
          setIsLoadingQuote(false);
        }
      }
    }

    void fetchQuote();
    return () => {
      isActive = false;
    };
  }, [id]);

  useEffect(() => () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
  }, [pdfUrl]);

  const apiBase = import.meta.env.VITE_API_URL || window.location.origin;
  const shareUrl = quote?.share_token ? `${window.location.origin}/doc/${quote.share_token}` : null;
  const hasLocalPdf = Boolean(pdfUrl);
  const actionState = resolveActionState(quote, hasLocalPdf);
  const emailActionLabel = getEmailActionLabel(actionState);
  const hasCustomerEmail = Boolean(readOptionalQuoteText(quote, "customer_email"));
  const openPdfUrl = pdfUrl ?? (quote?.share_token ? `${apiBase}/share/${quote.share_token}` : null);
  const quoteTitle = readOptionalQuoteText(quote, "title");
  const customerNameForHeader = readOptionalQuoteText(quote, "customer_name");
  const clientName = readOptionalQuoteText(quote, "customer_name") ?? quote?.customer_id ?? "Unknown customer";
  const clientContact =
    [readOptionalQuoteText(quote, "customer_email"), readOptionalQuoteText(quote, "customer_phone")]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join(" \u00b7 ") || "No contact details";
  const compactStatusRow = getCompactStatusRow(actionState, quote, hasLocalPdf);
  const canEdit = Boolean(quote && id && !CLOSED_QUOTE_STATUSES.has(actionState));
  const isBusy =
    isGeneratingPdf || isSharing || isSendingEmail || isMarkingWon || isMarkingLost || isDeleting;

  function handleBack(): void {
    if (canNavigateBack()) {
      navigate(-1);
      return;
    }

    navigate("/", { replace: true });
  }

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
        if (currentPdfUrl) {
          URL.revokeObjectURL(currentPdfUrl);
        }
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

  function applyQuoteUpdate(updatedQuote: Quote): void {
    setQuote((currentQuote) => {
      if (!currentQuote) {
        return currentQuote;
      }

      return {
        ...currentQuote,
        title: updatedQuote.title,
        status: updatedQuote.status,
        shared_at: updatedQuote.shared_at,
        share_token: updatedQuote.share_token,
        updated_at: updatedQuote.updated_at,
      };
    });
  }

  async function ensureShareUrl(): Promise<{ url: string; shareTitle: string }> {
    if (!id || !quote) {
      throw new Error("Share link unavailable");
    }

    if (quote.share_token) {
      return {
        url: `${window.location.origin}/doc/${quote.share_token}`,
        shareTitle: quote.title ?? `Quote ${quote.doc_number}`,
      };
    }

    const updatedQuote = await quoteService.shareQuote(id);
    applyQuoteUpdate(updatedQuote);
    if (!updatedQuote.share_token) {
      throw new Error("Share link unavailable");
    }
    return {
      url: `${window.location.origin}/doc/${updatedQuote.share_token}`,
      shareTitle: updatedQuote.title ?? `Quote ${updatedQuote.doc_number}`,
    };
  }

  async function onCopyLink(): Promise<void> {
    setShareError(null);
    setShareMessage(null);
    setIsSharing(true);

    try {
      const { url: nextSharedUrl, shareTitle } = await ensureShareUrl();
      const maybeNavigator = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };

      if (typeof maybeNavigator.share === "function") {
        try {
          await maybeNavigator.share({
            title: shareTitle,
            url: nextSharedUrl,
          });
          setShareMessage("Quote link shared.");
          return;
        } catch (error) {
          if (isShareAbortError(error)) {
            return;
          }
          throw error;
        }
      }

      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
        setShareMessage("Copy this share link manually.");
        return;
      }

      await navigator.clipboard.writeText(nextSharedUrl);
      setShareMessage("Share link copied to clipboard.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to copy share link";
      setShareError(message);
    } finally {
      setIsSharing(false);
    }
  }

  async function onSendEmail(): Promise<void> {
    if (!id || !quote) {
      return;
    }

    setShareError(null);
    setShareMessage(null);
    setIsSendingEmail(true);

    try {
      const updatedQuote = await quoteService.sendQuoteEmail(id);
      applyQuoteUpdate(updatedQuote);
      setShareMessage("Quote email sent.");
    } catch (error) {
      setShareError(getSendEmailErrorMessage(error));
    } finally {
      setIsSendingEmail(false);
    }
  }

  async function refetchQuote(quoteId: string): Promise<void> {
    const refreshedQuote = await quoteService.getQuote(quoteId);
    setQuote(refreshedQuote);
  }

  async function onConfirmMarkWon(): Promise<void> {
    if (!id || !quote) {
      return;
    }

    setOutcomeError(null);
    setShareError(null);
    setShareMessage(null);
    setShowMarkWonConfirm(false);
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

  const overflowItems = buildOverflowItems({
    hasQuote: Boolean(quote),
    actionState,
    isBusy,
    onDeleteRequest: () => setShowDeleteConfirm(true),
    onMarkWonRequest: () => setShowMarkWonConfirm(true),
    onMarkLostRequest: () => setShowMarkLostConfirm(true),
  });

  return (
    <main className="min-h-screen bg-background pb-24 pt-16">
      <ScreenHeader
        title={quoteTitle ?? customerNameForHeader ?? quote?.doc_number ?? "Quote Preview"}
        subtitle={quoteTitle || customerNameForHeader ? quote?.doc_number : undefined}
        onBack={handleBack}
        trailing={quote ? (
          <QuotePreviewHeaderActions
            status={quote.status}
            canEdit={canEdit}
            onEdit={() => navigate(`/quotes/${id}/edit`)}
            overflowItems={overflowItems}
          />
        ) : null}
      />

      <section className="mx-auto w-full max-w-3xl">
        {isLoadingQuote ? <p role="status" className="mt-4 px-4 text-sm text-on-surface-variant">Loading quote...</p> : null}

        {loadError ? (
          <div className="mx-4 mt-4">
            <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
          </div>
        ) : null}

        {!isLoadingQuote && !loadError ? (
          <>
            {compactStatusRow ? <QuotePreviewStatusRow row={compactStatusRow} /> : null}

            {quote ? (
              <QuoteDetailsCard
                totalAmount={quote.total_amount}
                clientName={clientName}
                clientContact={clientContact}
              />
            ) : null}
            {quote ? <QuoteLineItemsSection lineItems={quote.line_items} /> : null}

            <QuotePreviewActions
              actionState={actionState}
              emailActionLabel={emailActionLabel}
              hasCustomerEmail={hasCustomerEmail}
              onGeneratePdf={onGeneratePdf}
              onSendEmail={onSendEmail}
              onCopyLink={onCopyLink}
              openPdfUrl={openPdfUrl}
              shareUrl={shareUrl}
              isGeneratingPdf={isGeneratingPdf}
              isSendingEmail={isSendingEmail}
              isCopyingLink={isSharing}
              isMarkingWon={isMarkingWon}
              isMarkingLost={isMarkingLost}
              disabled={isLoadingQuote || !!loadError}
              pdfError={pdfError}
              shareError={shareError}
              outcomeError={outcomeError}
              shareMessage={shareMessage}
            />

            {deleteError ? (
              <div className="mx-4 mt-3">
                <FeedbackMessage variant="error">{deleteError}</FeedbackMessage>
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

      {showMarkWonConfirm ? (
        <ConfirmModal
          title="Mark quote as won?"
          body="This records the quote as won. You can still view the quote and its PDF."
          confirmLabel="Mark as Won"
          cancelLabel="Cancel"
          onConfirm={() => void onConfirmMarkWon()}
          onCancel={() => setShowMarkWonConfirm(false)}
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
