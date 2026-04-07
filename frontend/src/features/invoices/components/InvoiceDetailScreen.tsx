import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { mergeInvoiceDetailWithUpdate } from "@/features/invoices/components/invoiceDetail.helpers";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import type { Invoice, InvoiceDetail } from "@/features/invoices/types/invoice.types";
import { isInvoiceEditableStatus } from "@/features/invoices/utils/invoiceStatus";
import { QuoteDetailsCard } from "@/features/quotes/components/QuoteDetailsCard";
import { QuoteLineItemsSection } from "@/features/quotes/components/QuoteLineItemsSection";
import { BottomNav } from "@/shared/components/BottomNav";
import { Button } from "@/shared/components/Button";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import {
  DocumentActionError,
  DocumentActionHint,
  DocumentActionManualCopyField,
  DocumentActionSuccessMessage,
  DocumentActionSurface,
  documentActionPrimaryButtonClassName,
  documentActionPrimaryLinkClassName,
  documentActionUtilityButtonClassName,
} from "@/shared/components/DocumentActionSurface";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { formatDate } from "@/shared/lib/formatters";
import { jobService } from "@/shared/lib/jobService";
import { pollJobUntilSuccess } from "@/shared/lib/jobPolling";
import { canNavigateBack } from "@/shared/lib/navigation";

export function InvoiceDetailScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [isLoadingInvoice, setIsLoadingInvoice] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [manualCopyUrl, setManualCopyUrl] = useState<string | null>(null);
  const [showSendEmailConfirm, setShowSendEmailConfirm] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);

  async function loadInvoiceDetail(invoiceId: string): Promise<void> {
    setIsLoadingInvoice(true);
    setLoadError(null);
    try {
      const fetchedInvoice = await invoiceService.getInvoice(invoiceId);
      setInvoice(fetchedInvoice);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load invoice";
      setLoadError(message);
    } finally {
      setIsLoadingInvoice(false);
    }
  }

  useEffect(() => {
    if (!id) {
      setLoadError("Missing invoice id.");
      setIsLoadingInvoice(false);
      return;
    }
    const invoiceId = id;
    let isActive = true;
    void (async () => {
      setIsLoadingInvoice(true);
      setLoadError(null);
      try {
        const fetchedInvoice = await invoiceService.getInvoice(invoiceId);
        if (!isActive) {
          return;
        }
        setInvoice(fetchedInvoice);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load invoice";
        if (isActive) {
          setLoadError(message);
        }
      } finally {
        if (isActive) {
          setIsLoadingInvoice(false);
        }
      }
    })();
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
  const rawShareUrl = invoice?.share_token ? `${apiBase}/share/${invoice.share_token}` : null;
  const openPdfUrl = pdfUrl ?? rawShareUrl;
  const hasSourceQuote = Boolean(invoice?.source_document_id && invoice.source_quote_number);
  const hasCustomerEmail = Boolean(invoice?.customer.email?.trim());
  const customerEmail = invoice?.customer.email?.trim() || null;
  const canEdit = Boolean(invoice && id && isInvoiceEditableStatus(invoice.status));
  const emailActionLabel = invoice?.status === "ready"
    ? "Send Email"
    : invoice?.status === "sent" ? "Resend Email" : null;
  const shouldRenderNotes = Boolean(invoice?.notes?.trim());
  const clientContact = invoice?.customer.phone?.trim()
    || invoice?.customer.email?.trim()
    || "No contact details";
  function invalidateLocalPdf(): void {
    setPdfUrl(null);
  }

  function handleBack(): void {
    if (canNavigateBack()) return void navigate(-1);
    navigate("/", { replace: true });
  }

  function applyInvoiceUpdate(updatedInvoice: Invoice): void {
    invalidateLocalPdf();
    setInvoice((currentInvoice) => mergeInvoiceDetailWithUpdate(currentInvoice, updatedInvoice));
  }

  async function onGeneratePdf(): Promise<void> {
    if (!id) {
      return;
    }

    setPdfError(null);
    setEmailError(null);
    setEmailMessage(null);
    setShareError(null);
    setShareMessage(null);
    setManualCopyUrl(null);
    setIsGeneratingPdf(true);
    try {
      const blob = await invoiceService.generatePdf(id);
      const nextPdfUrl = URL.createObjectURL(blob);
      setPdfUrl((currentPdfUrl) => {
        if (currentPdfUrl) {
          URL.revokeObjectURL(currentPdfUrl);
        }
        return nextPdfUrl;
      });
      setInvoice((currentInvoice) => (
        currentInvoice && currentInvoice.status === "draft"
          ? { ...currentInvoice, status: "ready" }
          : currentInvoice
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate invoice PDF";
      setPdfError(message);
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  async function onCopyLink(): Promise<void> {
    if (!id) {
      return;
    }

    setEmailError(null);
    setEmailMessage(null);
    setShareError(null);
    setShareMessage(null);
    setManualCopyUrl(null);
    setIsSharing(true);
    try {
      const updatedInvoice = invoice?.share_token ? invoice : await invoiceService.shareInvoice(id);
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

  function onRequestSendEmail(): void {
    if (!emailActionLabel || !hasCustomerEmail || isGeneratingPdf || isSharing || isSendingEmail) {
      return;
    }

    setEmailError(null);
    setEmailMessage(null);
    setShowSendEmailConfirm(true);
  }

  async function onConfirmSendEmail(): Promise<void> {
    if (!id) {
      return;
    }

    setShowSendEmailConfirm(false);
    setEmailError(null);
    setEmailMessage(null);
    setShareError(null);
    setShareMessage(null);
    setManualCopyUrl(null);
    setIsSendingEmail(true);

    try {
      const job = await invoiceService.sendInvoiceEmail(id);
      await loadInvoiceDetail(id);
      setEmailMessage("Invoice email is sending. We’ll update this status shortly.");
      await pollJobUntilSuccess({
        jobId: job.id,
        getJobStatus: (jobId) => jobService.getJobStatus(jobId),
        terminalErrorMessage: "Invoice email failed. Please try again.",
        timeoutErrorMessage: "Invoice email is taking longer than expected. Refresh to check delivery status.",
      });
      await loadInvoiceDetail(id);
      setEmailMessage("Invoice sent by email.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send invoice email";
      setEmailError(message);
    } finally {
      setIsSendingEmail(false);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-24 pt-16">
      <ScreenHeader
        title={invoice?.title ?? invoice?.doc_number ?? "Invoice"}
        subtitle={invoice?.title ? invoice.doc_number : undefined}
        onBack={handleBack}
        trailing={invoice ? (
          <div className="flex items-center gap-2">
            <StatusBadge variant={invoice.status} />
            {canEdit ? (
              <button
                type="button"
                onClick={() => navigate(`/invoices/${invoice.id}/edit`)}
                aria-label="Edit invoice"
                className="inline-flex h-10 w-10 cursor-pointer shrink-0 items-center justify-center rounded-full border border-outline-variant/30 bg-surface-container-lowest text-on-surface ghost-shadow transition-all hover:bg-surface-container-low active:scale-95"
              >
                <span className="material-symbols-outlined block text-[1.125rem] leading-none">edit</span>
              </button>
            ) : null}
          </div>
        ) : null}
      />

      <section className="mx-auto w-full max-w-3xl">
        {isLoadingInvoice ? (
          <p role="status" className="mt-4 px-4 text-sm text-on-surface-variant">
            Loading invoice...
          </p>
        ) : null}

        {loadError ? (
          <div className="mx-4 mt-4">
            <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
          </div>
        ) : null}

        {!isLoadingInvoice && !loadError && invoice ? (
          <>
            <QuoteDetailsCard
              documentLabel="INVOICE"
              totalAmount={invoice.total_amount}
              taxRate={invoice.tax_rate}
              discountType={invoice.discount_type}
              discountValue={invoice.discount_value}
              depositAmount={invoice.deposit_amount}
              lineItemPrices={invoice.line_items.map((lineItem) => lineItem.price)}
              clientName={invoice.customer.name}
              clientContact={clientContact}
            />

            <section className="mt-4 px-4">
              <div className="ghost-shadow rounded-lg border border-outline/40 bg-surface-container-lowest p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                      Invoice Status
                    </p>
                    <p className="mt-2 text-sm text-on-surface-variant">
                      {hasSourceQuote
                        ? `Created from quote ${invoice.source_quote_number} on ${formatDate(invoice.created_at)}`
                        : `Created on ${formatDate(invoice.created_at)}`}
                    </p>
                    {hasSourceQuote ? (
                      <button
                        type="button"
                        className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-primary"
                        aria-label={`Open quote ${invoice.source_quote_number}`}
                        onClick={() => navigate(`/quotes/${invoice.source_document_id}/preview`)}
                      >
                        Open quote
                        <span className="material-symbols-outlined text-base">arrow_forward</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
            <QuoteLineItemsSection lineItems={invoice.line_items} />

            <section className="px-4 pb-2">
              <div className="rounded-lg bg-surface-container-low p-4">
                <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                  Due Date
                </p>
                <p className="mt-3 text-sm text-on-surface">
                  {invoice.due_date ? formatDate(`${invoice.due_date}T00:00:00.000Z`) : "No due date"}
                </p>
              </div>
            </section>

            {shouldRenderNotes ? (
              <section className="px-4 pb-2">
                <div className="rounded-lg bg-surface-container-low p-4">
                  <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                    Customer Notes
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-on-surface-variant">
                    {invoice.notes}
                  </p>
                </div>
              </section>
            ) : null}

            <DocumentActionSurface
              sectionLabel="Invoice actions"
              primaryAction={openPdfUrl ? (
                <a
                  href={openPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={documentActionPrimaryLinkClassName}
                >
                  <span className="material-symbols-outlined text-base">open_in_new</span>
                  Open PDF
                </a>
              ) : (
                <Button
                  type="button"
                  className={documentActionPrimaryButtonClassName}
                  disabled={isSharing || isSendingEmail}
                  onClick={() => {
                    void onGeneratePdf();
                  }}
                  isLoading={isGeneratingPdf}
                >
                  Generate PDF
                </Button>
              )}
              utilityActions={(
                <>
                  {emailActionLabel ? (
                    <button
                      type="button"
                      className={documentActionUtilityButtonClassName}
                      disabled={!hasCustomerEmail || isGeneratingPdf || isSharing || isSendingEmail}
                      onClick={onRequestSendEmail}
                    >
                      <span className="material-symbols-outlined text-base">mail</span>
                      {isSendingEmail ? "Sending..." : emailActionLabel}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className={documentActionUtilityButtonClassName}
                    disabled={isSharing || isGeneratingPdf || isSendingEmail}
                    onClick={() => {
                      void onCopyLink();
                    }}
                  >
                    <span className="material-symbols-outlined text-base">content_copy</span>
                    Copy Link
                  </button>
                </>
              )}
              utilityLabel="Invoice utilities"
              utilityColumns={emailActionLabel ? 2 : 1}
              hint={!hasCustomerEmail && emailActionLabel ? (
                <DocumentActionHint>
                  Add a customer email to send this invoice via email. Copy Link still works.
                </DocumentActionHint>
              ) : null}
              feedback={(
                <>
                  {pdfError ? <DocumentActionError>{pdfError}</DocumentActionError> : null}
                  {emailError ? <DocumentActionError>{emailError}</DocumentActionError> : null}
                  {shareError ? <DocumentActionError>{shareError}</DocumentActionError> : null}
                  {manualCopyUrl ? (
                    <DocumentActionManualCopyField url={manualCopyUrl} />
                  ) : null}
                  {emailMessage ? (
                    <DocumentActionSuccessMessage>{emailMessage}</DocumentActionSuccessMessage>
                  ) : null}
                  {shareMessage ? (
                    <DocumentActionSuccessMessage>{shareMessage}</DocumentActionSuccessMessage>
                  ) : null}
                </>
              )}
            />
          </>
        ) : null}
      </section>

      {showSendEmailConfirm && emailActionLabel ? (
        <ConfirmModal
          title={`${emailActionLabel}?`}
          body={customerEmail ? (
            <>
              This sends the latest invoice to{" "}
              <span className="break-all font-medium text-on-surface">{customerEmail}</span>.
            </>
          ) : "This sends the latest invoice to the customer email on file."}
          confirmLabel={emailActionLabel}
          cancelLabel="Cancel"
          onConfirm={() => {
            void onConfirmSendEmail();
          }}
          onCancel={() => setShowSendEmailConfirm(false)}
        />
      ) : null}

      <BottomNav active="quotes" />
    </main>
  );
}
