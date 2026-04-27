import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { useInvoiceDetailActions } from "@/features/invoices/hooks/useInvoiceDetailActions";
import { useInvoiceDetail } from "@/features/invoices/hooks/useInvoiceDetail";
import { buildInvoiceOutcomeOverflowItems } from "@/features/invoices/components/invoiceDetail.helpers";
import { isInvoiceEditableStatus } from "@/features/invoices/utils/invoiceStatus";
import { QuoteLineItemsSection } from "@/features/quotes/components/QuoteLineItemsSection";
import { BottomNav } from "@/shared/components/BottomNav";
import { Button } from "@/shared/components/Button";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { DetailPageSkeleton } from "@/shared/components/DetailPageSkeleton";
import {
  DocumentActionError,
  DocumentActionHint,
  DocumentActionManualCopyField,
  DocumentActionStatus,
  DocumentActionSurface,
  documentActionPrimaryLinkClassName,
} from "@/shared/components/DocumentActionSurface";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { OverflowMenu } from "@/shared/components/OverflowMenu";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { DocumentHeroCard } from "@/ui/DocumentHeroCard";
import { Eyebrow } from "@/ui/Eyebrow";
import { AppIcon } from "@/ui/Icon";
import { canNavigateBack } from "@/shared/lib/navigation";
import { useToast } from "@/ui/Toast";

export function InvoiceDetailScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { show } = useToast();
  const { id } = useParams<{ id: string }>();
  const [showRevokeShareConfirm, setShowRevokeShareConfirm] = useState(false);
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
  } = useInvoiceDetailActions({
    invoiceId: id,
    invoice,
    setInvoice,
    loadInvoiceDetail,
    onSuccess: (message) => {
      show({ message, variant: "success" });
    },
  });
  const openPdfUrl = invoice?.pdf_artifact.download_url ?? null;
  const hasSourceQuote = Boolean(invoice?.source_document_id && invoice.source_quote_number);
  const hasCustomerEmail = Boolean(invoice?.customer.email?.trim());
  const customerEmail = invoice?.customer.email?.trim() || null;
  const canEdit = Boolean(invoice && id && isInvoiceEditableStatus(invoice.status));
  const emailActionLabel = invoice?.status === "ready"
    ? "Send Email"
    : invoice?.status === "sent" || invoice?.status === "paid" || invoice?.status === "void"
      ? (invoice.has_active_share ? "Resend Email" : "Send Email")
      : null;
  const shouldRenderNotes = Boolean(invoice?.notes?.trim());
  const clientContact = invoice?.customer.phone?.trim()
    || invoice?.customer.email?.trim()
    || "No contact details";
  const headerSubtitle = invoice
    ? (invoice.title ? `${invoice.doc_number} · ${invoice.title}` : invoice.doc_number)
    : undefined;
  const isPdfBusy = isGeneratingPdf || invoice?.pdf_artifact.status === "pending";
  const isOutcomeBusy = isMarkingPaid || isMarkingVoid;
  const isBusy = isPdfBusy || isSharing || isRevokingShare || isSendingEmail || isOutcomeBusy;
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
    : isMarkingPaid ? "Recording invoice as paid..."
    : isMarkingVoid ? "Recording invoice as void..."
    : isRevokingShare ? "Revoking share link..."
    : isSharing ? "Copying share link..."
    : null;

  const overflowItems = buildInvoiceOutcomeOverflowItems({
    status: invoice?.status ?? null,
    hasActiveShare: Boolean(invoice?.has_active_share),
    isBusy,
    onRevokeShareRequest: () => {
      setShowRevokeShareConfirm(true);
    },
    onMarkPaidRequest: () => {
      void onMarkInvoicePaid();
    },
    onMarkVoidRequest: () => {
      void onMarkInvoiceVoid();
    },
  });

  return (
    <main className="min-h-screen bg-background pb-24 pt-16">
      <ScreenHeader
        title="Invoice Preview"
        subtitle={headerSubtitle}
        onBack={handleBack}
        trailing={invoice ? (
          <div className="flex items-center gap-2">
            {canEdit ? (
              <Button
                variant="iconButton"
                size="sm"
                onClick={() => navigate(`/documents/${invoice.id}/edit`)}
                aria-label="Edit invoice"
                className="border border-outline-variant/30 bg-surface-container-lowest text-on-surface ghost-shadow"
              >
                <AppIcon name="edit" className="block text-[1.125rem] leading-none" />
              </Button>
            ) : null}
            <OverflowMenu items={overflowItems} />
          </div>
        ) : null}
      />

      <section className="mx-auto w-full max-w-3xl">
        {isLoadingInvoice ? (
          <div role="status" aria-label="Loading invoice" className="mt-4 px-4">
            <DetailPageSkeleton />
          </div>
        ) : null}

        {loadError ? (
          <div className="mx-4 mt-4">
            <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
          </div>
        ) : null}

        {!isLoadingInvoice && !loadError && invoice ? (
          <>
            <DocumentHeroCard
              documentLabel="INVOICE"
              status={invoice.status}
              totalAmount={invoice.total_amount}
              taxRate={invoice.tax_rate}
              discountType={invoice.discount_type}
              discountValue={invoice.discount_value}
              depositAmount={invoice.deposit_amount}
              lineItemPrices={invoice.line_items.map((lineItem) => lineItem.price)}
              clientName={invoice.customer.name}
              clientContact={clientContact}
              dueDate={invoice.due_date}
              linkedDocument={hasSourceQuote ? {
                actionLabel: "Open linked quote",
                actionAriaLabel: invoice.source_quote_number
                  ? `Open linked quote ${invoice.source_quote_number}`
                  : "Open linked quote",
                onClick: () => navigate(`/quotes/${invoice.source_document_id}/preview`),
              } : null}
            />
            <QuoteLineItemsSection lineItems={invoice.line_items} />

            {shouldRenderNotes ? (
              <section className="mt-3 px-4">
                <div className="ghost-shadow rounded-[var(--radius-document)] border border-outline-variant/30 bg-surface-container-lowest p-4">
                  <Eyebrow>Customer Notes</Eyebrow>
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
                  <AppIcon name="open_in_new" className="text-base leading-none" />
                  Open PDF
                </a>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={isBusy}
                  onClick={() => {
                    void onGeneratePdf();
                  }}
                  isLoading={isPdfBusy}
                  leadingIcon={<AppIcon name="picture_as_pdf" className="text-base leading-none" />}
                >
                  Generate PDF
                </Button>
              )}
              utilityActions={(
                <>
                  {emailActionLabel ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      className="w-full"
                      disabled={!hasCustomerEmail || isBusy}
                      isLoading={isSendingEmail}
                      leadingIcon={<AppIcon name="mail" className="text-base leading-none" />}
                      onClick={() => onRequestSendEmail({ emailActionLabel, hasCustomerEmail, isPdfBusy })}
                    >
                      {emailActionLabel}
                    </Button>
                  ) : null}

                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    disabled={isBusy}
                    leadingIcon={<AppIcon name="content_copy" className="text-base leading-none" />}
                    onClick={() => {
                      void onCopyLink();
                    }}
                  >
                    Copy Link
                  </Button>
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
                  {outcomeError ? <DocumentActionError>{outcomeError}</DocumentActionError> : null}
                  {shareError ? <DocumentActionError>{shareError}</DocumentActionError> : null}
                  {manualCopyUrl ? (
                    <>
                      <DocumentActionHint>Copy this share link manually.</DocumentActionHint>
                      <DocumentActionManualCopyField url={manualCopyUrl} />
                    </>
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

      {showRevokeShareConfirm ? (
        <ConfirmModal
          title="Revoke share link?"
          body="Anyone with this link will no longer be able to view this document."
          confirmLabel="Revoke Link"
          cancelLabel="Cancel"
          variant="destructive"
          onConfirm={() => {
            setShowRevokeShareConfirm(false);
            void onRevokeShare();
          }}
          onCancel={() => setShowRevokeShareConfirm(false)}
        />
      ) : null}

      <BottomNav active="quotes" />
    </main>
  );
}
