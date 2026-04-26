import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { mergeInvoiceDetailWithUpdate } from "@/features/invoices/components/invoiceDetail.helpers";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import type { Invoice, InvoiceDetail } from "@/features/invoices/types/invoice.types";
import { usePendingPdfArtifactResume } from "@/shared/hooks/usePendingPdfArtifactResume";
import { jobService } from "@/shared/lib/jobService";
import { pollJobUntilSuccess } from "@/shared/lib/jobPolling";

interface UseInvoiceDetailActionsArgs {
  invoiceId: string | undefined;
  invoice: InvoiceDetail | null;
  setInvoice: Dispatch<SetStateAction<InvoiceDetail | null>>;
  loadInvoiceDetail: (invoiceId: string) => Promise<void>;
  onSuccess: (message: string) => void;
}

interface UseInvoiceDetailActionsResult {
  isGeneratingPdf: boolean;
  pdfError: string | null;
  isSharing: boolean;
  isRevokingShare: boolean;
  shareError: string | null;
  manualCopyUrl: string | null;
  showSendEmailConfirm: boolean;
  isSendingEmail: boolean;
  isMarkingPaid: boolean;
  isMarkingVoid: boolean;
  emailError: string | null;
  outcomeError: string | null;
  setShowSendEmailConfirm: Dispatch<SetStateAction<boolean>>;
  onGeneratePdf: () => Promise<void>;
  onCopyLink: () => Promise<void>;
  onRequestSendEmail: (args: {
    emailActionLabel: string | null;
    hasCustomerEmail: boolean;
    isPdfBusy: boolean;
  }) => void;
  onConfirmSendEmail: () => Promise<void>;
  onRevokeShare: () => Promise<void>;
  onMarkInvoicePaid: () => Promise<void>;
  onMarkInvoiceVoid: () => Promise<void>;
}

export function useInvoiceDetailActions({
  invoiceId,
  invoice,
  setInvoice,
  loadInvoiceDetail,
  onSuccess,
}: UseInvoiceDetailActionsArgs): UseInvoiceDetailActionsResult {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isRevokingShare, setIsRevokingShare] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [manualCopyUrl, setManualCopyUrl] = useState<string | null>(null);
  const [showSendEmailConfirm, setShowSendEmailConfirm] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [isMarkingVoid, setIsMarkingVoid] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);

  function getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function clearActionFeedback(options?: { includePdfError?: boolean }): void {
    if (options?.includePdfError) {
      setPdfError(null);
    }
    setEmailError(null);
    setOutcomeError(null);
    setShareError(null);
    setManualCopyUrl(null);
  }

  usePendingPdfArtifactResume({
    artifact: invoice?.pdf_artifact,
    enabled: Boolean(invoiceId) && !isGeneratingPdf,
    getJobStatus: jobService.getJobStatus,
    onCompletion: async () => {
      if (!invoiceId) {
        return;
      }
      setPdfError(null);
      await loadInvoiceDetail(invoiceId);
    },
    onError: (message) => {
      setPdfError(message);
    },
    timeoutErrorMessage: "Invoice PDF is taking longer than expected. Refresh to check its status.",
  });

  function applyInvoiceUpdate(
    updatedInvoice: Invoice,
    options?: { hasActiveShare?: boolean },
  ): void {
    setInvoice((currentInvoice) => {
      const mergedInvoice = mergeInvoiceDetailWithUpdate(currentInvoice, updatedInvoice);
      if (!mergedInvoice) {
        return mergedInvoice;
      }
      if (options?.hasActiveShare === undefined) {
        return mergedInvoice;
      }
      return {
        ...mergedInvoice,
        has_active_share: options.hasActiveShare,
      };
    });
  }

  async function onGeneratePdf(): Promise<void> {
    if (!invoiceId) return;

    clearActionFeedback({ includePdfError: true });
    setIsGeneratingPdf(true);
    try {
      const job = await invoiceService.generatePdf(invoiceId);
      await loadInvoiceDetail(invoiceId);
      await pollJobUntilSuccess({
        jobId: job.id,
        getJobStatus: jobService.getJobStatus,
        terminalErrorMessage: "Invoice PDF failed. Please try again.",
        timeoutErrorMessage: "Invoice PDF is taking longer than expected. Refresh to check its status.",
      });
      await loadInvoiceDetail(invoiceId);
    } catch (error) {
      setPdfError(getErrorMessage(error, "Unable to generate invoice PDF"));
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  async function onCopyLink(): Promise<void> {
    if (!invoiceId) return;

    const apiBase = import.meta.env.VITE_API_URL || window.location.origin;
    clearActionFeedback();
    setIsSharing(true);
    try {
      const updatedInvoice = invoice?.has_active_share && invoice.share_token
        ? invoice
        : await invoiceService.shareInvoice(invoiceId);
      if (!(invoice?.has_active_share && invoice.share_token)) {
        applyInvoiceUpdate(updatedInvoice, { hasActiveShare: true });
      }
      if (!updatedInvoice.share_token) {
        throw new Error("Share link unavailable");
      }

      const nextShareUrl = `${apiBase}/share/${updatedInvoice.share_token}`;
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
        setManualCopyUrl(nextShareUrl);
        return;
      }

      await navigator.clipboard.writeText(nextShareUrl);
      setManualCopyUrl(null);
      onSuccess("Invoice link copied to clipboard.");
    } catch (error) {
      setManualCopyUrl(null);
      setShareError(getErrorMessage(error, "Unable to copy invoice link"));
    } finally {
      setIsSharing(false);
    }
  }

  async function onRevokeShare(): Promise<void> {
    if (!invoiceId) return;

    clearActionFeedback({ includePdfError: true });
    setIsRevokingShare(true);

    try {
      await invoiceService.revokeShare(invoiceId);
      await loadInvoiceDetail(invoiceId);
      onSuccess("Share link revoked.");
    } catch (error) {
      setShareError(getErrorMessage(error, "Unable to revoke share link"));
    } finally {
      setIsRevokingShare(false);
    }
  }

  function onRequestSendEmail({
    emailActionLabel,
    hasCustomerEmail,
    isPdfBusy,
  }: {
    emailActionLabel: string | null;
    hasCustomerEmail: boolean;
    isPdfBusy: boolean;
  }): void {
    if (!emailActionLabel || !hasCustomerEmail || isPdfBusy || isSharing || isSendingEmail) {
      return;
    }

    clearActionFeedback();
    setShowSendEmailConfirm(true);
  }

  async function onConfirmSendEmail(): Promise<void> {
    if (!invoiceId) return;

    setShowSendEmailConfirm(false);
    clearActionFeedback();
    setIsSendingEmail(true);

    try {
      const job = await invoiceService.sendInvoiceEmail(invoiceId);
      await loadInvoiceDetail(invoiceId);
      await pollJobUntilSuccess({
        jobId: job.id,
        getJobStatus: jobService.getJobStatus,
        terminalErrorMessage: "Invoice email failed. Please try again.",
        timeoutErrorMessage: "Invoice email is taking longer than expected. Refresh to check delivery status.",
      });
      await loadInvoiceDetail(invoiceId);
      onSuccess("Invoice sent by email.");
    } catch (error) {
      setEmailError(getErrorMessage(error, "Unable to send invoice email"));
    } finally {
      setIsSendingEmail(false);
    }
  }

  async function onMarkInvoicePaid(): Promise<void> {
    if (!invoiceId) return;

    clearActionFeedback({ includePdfError: true });
    setIsMarkingPaid(true);

    try {
      const updatedInvoice = await invoiceService.markInvoicePaid(invoiceId);
      applyInvoiceUpdate(updatedInvoice);
      onSuccess("Invoice marked as paid.");
    } catch (error) {
      setOutcomeError(getErrorMessage(error, "Unable to mark invoice as paid"));
    } finally {
      setIsMarkingPaid(false);
    }
  }

  async function onMarkInvoiceVoid(): Promise<void> {
    if (!invoiceId) return;

    clearActionFeedback({ includePdfError: true });
    setIsMarkingVoid(true);

    try {
      const updatedInvoice = await invoiceService.markInvoiceVoid(invoiceId);
      applyInvoiceUpdate(updatedInvoice);
      onSuccess("Invoice marked as void.");
    } catch (error) {
      setOutcomeError(getErrorMessage(error, "Unable to mark invoice as void"));
    } finally {
      setIsMarkingVoid(false);
    }
  }

  return {
    isGeneratingPdf,
    pdfError,
    isSharing,
    isRevokingShare,
    shareError,
    manualCopyUrl,
    showSendEmailConfirm,
    isSendingEmail,
    isMarkingPaid,
    isMarkingVoid,
    emailError,
    outcomeError,
    setShowSendEmailConfirm,
    onGeneratePdf,
    onCopyLink,
    onRequestSendEmail,
    onConfirmSendEmail,
    onRevokeShare,
    onMarkInvoicePaid,
    onMarkInvoiceVoid,
  };
}
