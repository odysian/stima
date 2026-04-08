import { useNavigate, useParams } from "react-router-dom";
import { useInvoiceDetailActions } from "@/features/invoices/hooks/useInvoiceDetailActions";
import { useInvoiceDetail } from "@/features/invoices/hooks/useInvoiceDetail";
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
  DocumentActionStatus,
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
import { canNavigateBack } from "@/shared/lib/navigation";

export function InvoiceDetailScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const {
    invoice,
    setInvoice,
    isLoadingInvoice,
    loadError,
    loadInvoiceDetail,
  } = useInvoiceDetail(id);
  const {
    isGeneratingPdf,
    pdfError,
    isSharing,
    shareError,
    shareMessage,
    manualCopyUrl,
    showSendEmailConfirm,
    isSendingEmail,
    emailError,
    emailMessage,
    setShowSendEmailConfirm,
    onGeneratePdf,
    onCopyLink,
    onRequestSendEmail,
    onConfirmSendEmail,
  } = useInvoiceDetailActions({
    invoiceId: id,
    invoice,
    setInvoice,
    loadInvoiceDetail,
  });
  const openPdfUrl = invoice?.pdf_artifact.download_url ?? null;
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
  const isPdfBusy = isGeneratingPdf || invoice?.pdf_artifact.status === "pending";
  const resolvedPdfError = pdfError ?? (
    invoice?.pdf_artifact.status === "failed"
      ? "Invoice PDF failed. Please try again."
      : null
  );

  function handleBack(): void {
    if (canNavigateBack()) return void navigate(-1);
    navigate("/", { replace: true });
  }

  const statusCopy = isPdfBusy
    ? "Generating PDF preview. This can take a few moments."
    : isSendingEmail ? "Sending invoice email..."
    : isSharing ? "Copying share link..."
    : null;

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
                  disabled={isSharing || isSendingEmail || isPdfBusy}
                  onClick={() => {
                    void onGeneratePdf();
                  }}
                  isLoading={isPdfBusy}
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
                      disabled={!hasCustomerEmail || isPdfBusy || isSharing || isSendingEmail}
                      onClick={() => onRequestSendEmail({ emailActionLabel, hasCustomerEmail, isPdfBusy })}
                    >
                      <span className="material-symbols-outlined text-base">mail</span>
                      {isSendingEmail ? "Sending..." : emailActionLabel}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className={documentActionUtilityButtonClassName}
                    disabled={isSharing || isPdfBusy || isSendingEmail}
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
              status={statusCopy ? <DocumentActionStatus>{statusCopy}</DocumentActionStatus> : null}
              feedback={(
                <>
                  {resolvedPdfError ? <DocumentActionError>{resolvedPdfError}</DocumentActionError> : null}
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
