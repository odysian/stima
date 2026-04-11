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
}

interface UseInvoiceDetailActionsResult {
  isGeneratingPdf: boolean;
  pdfError: string | null;
  isSharing: boolean;
  shareError: string | null;
  shareMessage: string | null;
  manualCopyUrl: string | null;
  showSendEmailConfirm: boolean;
  isSendingEmail: boolean;
  isMarkingPaid: boolean;
  isMarkingVoid: boolean;
  emailError: string | null;
  emailMessage: string | null;
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
  onMarkInvoicePaid: () => Promise<void>;
  onMarkInvoiceVoid: () => Promise<void>;
}

export function useInvoiceDetailActions({
  invoiceId,
  invoice,
  setInvoice,
  loadInvoiceDetail,
}: UseInvoiceDetailActionsArgs): UseInvoiceDetailActionsResult {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [manualCopyUrl, setManualCopyUrl] = useState<string | null>(null);
  const [showSendEmailConfirm, setShowSendEmailConfirm] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [isMarkingVoid, setIsMarkingVoid] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);

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

  function applyInvoiceUpdate(updatedInvoice: Invoice): void {
    setInvoice((currentInvoice) => mergeInvoiceDetailWithUpdate(currentInvoice, updatedInvoice));
  }

  async function onGeneratePdf(): Promise<void> {
    if (!invoiceId) {
      return;
    }

    setPdfError(null);
    setEmailError(null);
    setEmailMessage(null);
    setOutcomeError(null);
    setShareError(null);
    setShareMessage(null);
    setManualCopyUrl(null);
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
      const message = error instanceof Error ? error.message : "Unable to generate invoice PDF";
      setPdfError(message);
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  async function onCopyLink(): Promise<void> {
    if (!invoiceId) {
      return;
    }

    const apiBase = import.meta.env.VITE_API_URL || window.location.origin;
    setEmailError(null);
    setEmailMessage(null);
    setOutcomeError(null);
    setShareError(null);
    setShareMessage(null);
    setManualCopyUrl(null);
    setIsSharing(true);
    try {
      const updatedInvoice = invoice?.share_token ? invoice : await invoiceService.shareInvoice(invoiceId);
      if (!invoice?.share_token) {
        applyInvoiceUpdate(updatedInvoice);
      }
      if (!updatedInvoice.share_token) {
        throw new Error("Share link unavailable");
      }

      const nextShareUrl = `${apiBase}/share/${updatedInvoice.share_token}`;
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
        setManualCopyUrl(nextShareUrl);
        setShareMessage("Copy this share link manually.");
        return;
      }

      await navigator.clipboard.writeText(nextShareUrl);
      setManualCopyUrl(null);
      setShareMessage("Invoice link copied to clipboard.");
    } catch (error) {
      setManualCopyUrl(null);
      const message = error instanceof Error ? error.message : "Unable to copy invoice link";
      setShareError(message);
    } finally {
      setIsSharing(false);
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

    setEmailError(null);
    setEmailMessage(null);
    setOutcomeError(null);
    setShowSendEmailConfirm(true);
  }

  async function onConfirmSendEmail(): Promise<void> {
    if (!invoiceId) {
      return;
    }

    setShowSendEmailConfirm(false);
    setEmailError(null);
    setEmailMessage(null);
    setOutcomeError(null);
    setShareError(null);
    setShareMessage(null);
    setManualCopyUrl(null);
    setIsSendingEmail(true);

    try {
      const job = await invoiceService.sendInvoiceEmail(invoiceId);
      await loadInvoiceDetail(invoiceId);
      setEmailMessage("Invoice email is sending. We’ll update this status shortly.");
      await pollJobUntilSuccess({
        jobId: job.id,
        getJobStatus: jobService.getJobStatus,
        terminalErrorMessage: "Invoice email failed. Please try again.",
        timeoutErrorMessage: "Invoice email is taking longer than expected. Refresh to check delivery status.",
      });
      await loadInvoiceDetail(invoiceId);
      setEmailMessage("Invoice sent by email.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send invoice email";
      setEmailError(message);
    } finally {
      setIsSendingEmail(false);
    }
  }

  async function onMarkInvoicePaid(): Promise<void> {
    if (!invoiceId) {
      return;
    }

    setPdfError(null);
    setEmailError(null);
    setEmailMessage(null);
    setOutcomeError(null);
    setShareError(null);
    setShareMessage(null);
    setManualCopyUrl(null);
    setIsMarkingPaid(true);

    try {
      const updatedInvoice = await invoiceService.markInvoicePaid(invoiceId);
      applyInvoiceUpdate(updatedInvoice);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to mark invoice as paid";
      setOutcomeError(message);
    } finally {
      setIsMarkingPaid(false);
    }
  }

  async function onMarkInvoiceVoid(): Promise<void> {
    if (!invoiceId) {
      return;
    }

    setPdfError(null);
    setEmailError(null);
    setEmailMessage(null);
    setOutcomeError(null);
    setShareError(null);
    setShareMessage(null);
    setManualCopyUrl(null);
    setIsMarkingVoid(true);

    try {
      const updatedInvoice = await invoiceService.markInvoiceVoid(invoiceId);
      applyInvoiceUpdate(updatedInvoice);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to mark invoice as void";
      setOutcomeError(message);
    } finally {
      setIsMarkingVoid(false);
    }
  }

  return {
    isGeneratingPdf,
    pdfError,
    isSharing,
    shareError,
    shareMessage,
    manualCopyUrl,
    showSendEmailConfirm,
    isSendingEmail,
    isMarkingPaid,
    isMarkingVoid,
    emailError,
    emailMessage,
    outcomeError,
    setShowSendEmailConfirm,
    onGeneratePdf,
    onCopyLink,
    onRequestSendEmail,
    onConfirmSendEmail,
    onMarkInvoicePaid,
    onMarkInvoiceVoid,
  };
}
