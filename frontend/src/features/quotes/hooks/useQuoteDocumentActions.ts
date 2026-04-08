import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import {
  getSendEmailErrorMessage,
  isShareAbortError,
} from "@/features/quotes/components/quotePreview.helpers";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteDetail } from "@/features/quotes/types/quote.types";
import { usePendingPdfArtifactResume } from "@/shared/hooks/usePendingPdfArtifactResume";
import { jobService } from "@/shared/lib/jobService";
import { pollJobUntilSuccess } from "@/shared/lib/jobPolling";

interface UseQuoteDocumentActionsArgs {
  quoteId: string | undefined;
  quote: QuoteDetail | null;
  setQuote: Dispatch<SetStateAction<QuoteDetail | null>>;
  refetchQuote: (quoteId: string) => Promise<void>;
}

interface UseQuoteDocumentActionsResult {
  isGeneratingPdf: boolean;
  pdfError: string | null;
  isSharing: boolean;
  isSendingEmail: boolean;
  shareMessage: string | null;
  shareError: string | null;
  manualCopyUrl: string | null;
  showSendEmailConfirm: boolean;
  setShowSendEmailConfirm: Dispatch<SetStateAction<boolean>>;
  clearShareFeedback: () => void;
  onGeneratePdf: () => Promise<void>;
  onRequestSendEmail: (args: {
    hasCustomerEmail: boolean;
    emailActionLabel: string | null;
  }) => void;
  onConfirmSendEmail: () => Promise<void>;
  onCopyLink: () => Promise<void>;
}

export function useQuoteDocumentActions({
  quoteId,
  quote,
  setQuote,
  refetchQuote,
}: UseQuoteDocumentActionsArgs): UseQuoteDocumentActionsResult {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [manualCopyUrl, setManualCopyUrl] = useState<string | null>(null);
  const [showSendEmailConfirm, setShowSendEmailConfirm] = useState(false);

  function clearShareFeedback(): void {
    setShareError(null);
    setShareMessage(null);
    setManualCopyUrl(null);
  }

  usePendingPdfArtifactResume({
    artifact: quote?.pdf_artifact,
    enabled: Boolean(quoteId) && !isGeneratingPdf,
    getJobStatus: jobService.getJobStatus,
    onCompletion: async () => {
      if (!quoteId) {
        return;
      }
      setPdfError(null);
      await refetchQuote(quoteId);
    },
    onError: (message) => {
      setPdfError(message);
    },
    timeoutErrorMessage: "Quote PDF is taking longer than expected. Refresh to check its status.",
  });

  async function onGeneratePdf(): Promise<void> {
    if (!quoteId) {
      return;
    }

    setPdfError(null);
    clearShareFeedback();
    setIsGeneratingPdf(true);
    try {
      const job = await quoteService.generatePdf(quoteId);
      await refetchQuote(quoteId);
      await pollJobUntilSuccess({
        jobId: job.id,
        getJobStatus: jobService.getJobStatus,
        terminalErrorMessage: "Quote PDF failed. Please try again.",
        timeoutErrorMessage: "Quote PDF is taking longer than expected. Refresh to check its status.",
      });
      await refetchQuote(quoteId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate PDF";
      setPdfError(message);
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  async function ensureShareUrl(): Promise<{ url: string; shareTitle: string }> {
    if (!quoteId || !quote) {
      throw new Error("Share link unavailable");
    }

    if (quote.share_token) {
      return {
        url: `${window.location.origin}/doc/${quote.share_token}`,
        shareTitle: quote.title ?? `Quote ${quote.doc_number}`,
      };
    }

    const updatedQuote = await quoteService.shareQuote(quoteId);
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
    if (!updatedQuote.share_token) {
      throw new Error("Share link unavailable");
    }
    return {
      url: `${window.location.origin}/doc/${updatedQuote.share_token}`,
      shareTitle: updatedQuote.title ?? `Quote ${updatedQuote.doc_number}`,
    };
  }

  async function onCopyLink(): Promise<void> {
    clearShareFeedback();
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
          setManualCopyUrl(null);
          return;
        } catch (error) {
          if (isShareAbortError(error)) {
            return;
          }
          throw error;
        }
      }

      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
        setManualCopyUrl(nextSharedUrl);
        setShareMessage("Copy this share link manually.");
        return;
      }

      await navigator.clipboard.writeText(nextSharedUrl);
      setManualCopyUrl(null);
      setShareMessage("Share link copied to clipboard.");
    } catch (error) {
      setManualCopyUrl(null);
      const message = error instanceof Error ? error.message : "Unable to copy share link";
      setShareError(message);
    } finally {
      setIsSharing(false);
    }
  }

  function onRequestSendEmail({
    hasCustomerEmail,
    emailActionLabel,
  }: {
    hasCustomerEmail: boolean;
    emailActionLabel: string | null;
  }): void {
    if (!hasCustomerEmail || !emailActionLabel) {
      return;
    }

    setShowSendEmailConfirm(true);
  }

  async function onConfirmSendEmail(): Promise<void> {
    if (!quoteId || !quote) {
      return;
    }

    setShowSendEmailConfirm(false);
    clearShareFeedback();
    setIsSendingEmail(true);

    try {
      const job = await quoteService.sendQuoteEmail(quoteId);
      await refetchQuote(quoteId);
      setShareMessage("Quote email is sending. We’ll update this status shortly.");
      await pollJobUntilSuccess({
        jobId: job.id,
        getJobStatus: jobService.getJobStatus,
        terminalErrorMessage: "Quote email failed. Please try again.",
        timeoutErrorMessage: "Quote email is taking longer than expected. Refresh to check delivery status.",
      });
      await refetchQuote(quoteId);
      setShareMessage("Quote email sent.");
    } catch (error) {
      setShareError(getSendEmailErrorMessage(error));
    } finally {
      setIsSendingEmail(false);
    }
  }

  return {
    isGeneratingPdf,
    pdfError,
    isSharing,
    isSendingEmail,
    shareMessage,
    shareError,
    manualCopyUrl,
    showSendEmailConfirm,
    setShowSendEmailConfirm,
    clearShareFeedback,
    onGeneratePdf,
    onRequestSendEmail,
    onConfirmSendEmail,
    onCopyLink,
  };
}
