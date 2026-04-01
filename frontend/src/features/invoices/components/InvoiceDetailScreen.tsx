import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { invoiceService } from "@/features/invoices/services/invoiceService";
import type { Invoice, InvoiceDetail } from "@/features/invoices/types/invoice.types";
import { isInvoiceEditableStatus } from "@/features/invoices/utils/invoiceStatus";
import { QuoteDetailsCard } from "@/features/quotes/components/QuoteDetailsCard";
import { QuoteLineItemsSection } from "@/features/quotes/components/QuoteLineItemsSection";
import { BottomNav } from "@/shared/components/BottomNav";
import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { formatDate } from "@/shared/lib/formatters";

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

  useEffect(() => {
    if (!id) {
      setLoadError("Missing invoice id.");
      setIsLoadingInvoice(false);
      return;
    }
    const invoiceId = id;

    let isActive = true;

    async function fetchInvoice(): Promise<void> {
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
    }

    void fetchInvoice();
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
  const canEdit = Boolean(invoice && id && isInvoiceEditableStatus(invoice.status));
  const clientContact =
    [invoice?.customer.email, invoice?.customer.phone]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join(" · ") || "No contact details";
  function invalidateLocalPdf(): void {
    setPdfUrl(null);
  }

  function applyInvoiceUpdate(updatedInvoice: Invoice): void {
    invalidateLocalPdf();
    setInvoice((currentInvoice) => {
      if (!currentInvoice) {
        return currentInvoice;
      }

      return {
        ...currentInvoice,
        title: updatedInvoice.title,
        status: updatedInvoice.status,
        due_date: updatedInvoice.due_date,
        total_amount: updatedInvoice.total_amount,
        notes: updatedInvoice.notes,
        shared_at: updatedInvoice.shared_at,
        share_token: updatedInvoice.share_token,
        updated_at: updatedInvoice.updated_at,
        line_items: updatedInvoice.line_items,
      };
    });
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

    setShareError(null);
    setShareMessage(null);
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
        setShareMessage("Copy this share link manually.");
        return;
      }

      await navigator.clipboard.writeText(nextShareUrl);
      setShareMessage("Invoice link copied to clipboard.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to copy invoice link";
      setShareError(message);
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-24 pt-16">
      <ScreenHeader
        title={invoice?.title ?? invoice?.doc_number ?? "Invoice"}
        subtitle={invoice?.title ? invoice.doc_number : undefined}
        onBack={() => navigate(-1)}
        trailing={invoice ? (
          <div className="flex items-center gap-2">
            <StatusBadge variant={invoice.status} />
            {canEdit ? (
              <button
                type="button"
                onClick={() => navigate(`/invoices/${invoice.id}/edit`)}
                aria-label="Edit invoice"
                className="rounded-full border border-outline-variant/30 bg-surface-container-lowest p-2 text-on-surface ghost-shadow transition-all hover:bg-surface-container-low active:scale-95"
              >
                <span className="material-symbols-outlined text-[1.125rem]">edit</span>
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
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  {hasSourceQuote ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-primary"
                      onClick={() => navigate(`/quotes/${invoice.source_document_id}/preview`)}
                    >
                      Back to {invoice.source_quote_number}
                      <span className="material-symbols-outlined text-base">arrow_back</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <QuoteDetailsCard
              totalAmount={invoice.total_amount}
              taxRate={invoice.tax_rate}
              discountType={invoice.discount_type}
              discountValue={invoice.discount_value}
              depositAmount={invoice.deposit_amount}
              lineItemPrices={invoice.line_items.map((lineItem) => lineItem.price)}
              clientName={invoice.customer.name}
              clientContact={clientContact}
            />
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

            <section className="px-4 pb-2">
              <div className="rounded-lg bg-surface-container-low p-4">
                <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                  Customer Notes
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm text-on-surface-variant">
                  {invoice.notes?.trim() ? invoice.notes : "No customer notes"}
                </p>
              </div>
            </section>

            <div className="mt-4 flex flex-col gap-3 px-4">
              {openPdfUrl ? (
                <a
                  href={openPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-surface-container px-4 py-4 text-center font-medium text-on-surface transition-all active:scale-[0.98]"
                >
                  <span className="material-symbols-outlined text-base">open_in_new</span>
                  Open PDF
                </a>
              ) : (
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    void onGeneratePdf();
                  }}
                  isLoading={isGeneratingPdf}
                >
                  Generate PDF
                </Button>
              )}

              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  void onCopyLink();
                }}
                isLoading={isSharing}
              >
                Copy Link
              </Button>
            </div>

            {pdfError ? (
              <div className="mx-4 mt-3">
                <FeedbackMessage variant="error">{pdfError}</FeedbackMessage>
              </div>
            ) : null}
            {shareError ? (
              <div className="mx-4 mt-3">
                <FeedbackMessage variant="error">{shareError}</FeedbackMessage>
              </div>
            ) : null}
            {shareMessage ? (
              <p className="mx-4 mt-3 rounded-md bg-success-container p-3 text-sm text-success">
                {shareMessage}
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      <BottomNav active="quotes" />
    </main>
  );
}
