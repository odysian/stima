import { useEffect } from "react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { QuoteDetailsCard } from "@/features/quotes/components/QuoteDetailsCard";
import { LinkedInvoiceCard } from "@/features/quotes/components/LinkedInvoiceCard";
import { QuotePreviewHeaderActions } from "@/features/quotes/components/QuotePreviewHeaderActions";
import { QuoteLineItemsSection } from "@/features/quotes/components/QuoteLineItemsSection";
import { QuotePreviewActions } from "@/features/quotes/components/QuotePreviewActions";
import { QuotePreviewDialogs } from "@/features/quotes/components/QuotePreviewDialogs";
import {
  buildOverflowItems,
  getEmailActionLabel,
  readOptionalQuoteText,
  resolveExtractionDegradedCopy,
  resolveActionState,
} from "@/features/quotes/components/quotePreview.helpers";
import { useQuoteDetail } from "@/features/quotes/hooks/useQuoteDetail";
import { useQuoteDocumentActions } from "@/features/quotes/hooks/useQuoteDocumentActions";
import { useQuoteInvoiceConversion } from "@/features/quotes/hooks/useQuoteInvoiceConversion";
import { useQuoteOutcomeActions } from "@/features/quotes/hooks/useQuoteOutcomeActions";
import { isQuoteEditableStatus } from "@/features/quotes/utils/quoteStatus";
import { BottomNav } from "@/shared/components/BottomNav";
import { DetailPageSkeleton } from "@/shared/components/DetailPageSkeleton";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { canNavigateBack } from "@/shared/lib/navigation";

export function QuotePreview(): React.ReactElement {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const {
    setQuote,
    quote,
    isLoadingQuote,
    loadError,
    refetchQuote,
  } = useQuoteDetail(id);

  const [showRevokeShareConfirm, setShowRevokeShareConfirm] = useState(false);

  const shareUrl = quote?.has_active_share && quote.share_token
    ? `${window.location.origin}/doc/${quote.share_token}`
    : null;
  const actionState = resolveActionState(quote);
  const emailActionLabel = getEmailActionLabel(actionState, Boolean(quote?.has_active_share));
  const hasCustomerEmail = Boolean(readOptionalQuoteText(quote, "customer_email"));
  const customerEmail = readOptionalQuoteText(quote, "customer_email");
  const openPdfUrl = quote?.pdf_artifact.download_url ?? null;
  const quoteTitle = readOptionalQuoteText(quote, "title");
  const customerNameForHeader = readOptionalQuoteText(quote, "customer_name");
  const clientName = readOptionalQuoteText(quote, "customer_name") ?? quote?.customer_id ?? "Unknown customer";
  const clientContact = readOptionalQuoteText(quote, "customer_phone") ?? readOptionalQuoteText(quote, "customer_email") ?? "No contact details";
  const extractionDegradedCopy = resolveExtractionDegradedCopy(quote);
  const canEdit = Boolean(quote && id && isQuoteEditableStatus(actionState));
  const requiresCustomerAssignment = quote
    ? (quote.requires_customer_assignment ?? quote.customer_id === null)
    : false;
  const showDraftInvoicePromptBelowActions = Boolean(quote && actionState === "draft" && !quote.linked_invoice);
  const {
    invoiceError,
    isConvertingInvoice,
    onConvertToInvoice,
    clearInvoiceError,
  } = useQuoteInvoiceConversion({
    quoteId: id,
    navigate,
    setQuote,
  });
  const {
    isGeneratingPdf,
    pdfError,
    isSharing,
    isRevokingShare,
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
    onRevokeShare,
  } = useQuoteDocumentActions({
    quoteId: id,
    quote,
    setQuote,
    refetchQuote,
  });
  const {
    isMarkingWon,
    isMarkingLost,
    outcomeError,
    isDeleting,
    deleteError,
    showDeleteConfirm,
    showMarkWonConfirm,
    showMarkLostConfirm,
    setShowDeleteConfirm,
    setShowMarkWonConfirm,
    setShowMarkLostConfirm,
    onConfirmMarkWon,
    onConfirmMarkLost,
    onDelete,
  } = useQuoteOutcomeActions({
    quoteId: id,
    quote,
    refetchQuote,
    navigate,
    clearInvoiceError,
    clearShareFeedback,
  });
  const resolvedPdfError = pdfError ?? (
    quote?.pdf_artifact.status === "failed"
      ? "Quote PDF failed. Please try again."
      : null
  );
  const isPdfBusy = isGeneratingPdf || quote?.pdf_artifact.status === "pending";
  const isBusy = isPdfBusy
    || isSharing
    || isRevokingShare
    || isSendingEmail
    || isMarkingWon
    || isMarkingLost
    || isDeleting
    || isConvertingInvoice;

  function handleBack(): void {
    if (canNavigateBack()) return void navigate(-1);
    navigate("/", { replace: true });
  }

  const overflowItems = buildOverflowItems({
    hasQuote: Boolean(quote),
    hasActiveShare: Boolean(quote?.has_active_share),
    actionState,
    isBusy,
    onRevokeShareRequest: () => setShowRevokeShareConfirm(true),
    onDeleteRequest: () => setShowDeleteConfirm(true),
    onMarkWonRequest: () => setShowMarkWonConfirm(true),
    onMarkLostRequest: () => setShowMarkLostConfirm(true),
  });

  useEffect(() => {
    if (!id || !quote || !requiresCustomerAssignment) {
      return;
    }

    navigate(`/documents/${id}/edit`, {
      replace: true,
      state: {
        origin: "preview",
        notice: "Assign a customer before continuing to preview.",
      },
    });
  }, [id, navigate, quote, requiresCustomerAssignment]);

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
            onEdit={() =>
              navigate(`/documents/${id}/edit`, {
                state: { origin: "preview" },
              })}
            overflowItems={overflowItems}
          />
        ) : null}
      />

      <section className="mx-auto w-full max-w-3xl">
        {isLoadingQuote ? (
          <div role="status" aria-label="Loading quote" className="mt-4 px-4">
            <DetailPageSkeleton />
          </div>
        ) : null}

        {loadError ? (
          <div className="mx-4 mt-4">
            <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
          </div>
        ) : null}

        {!isLoadingQuote && !loadError ? (
          <>
            {quote && extractionDegradedCopy ? (
              <div className="mx-4 mt-4 rounded-lg border border-warning-accent/40 bg-warning-container p-4 text-sm text-warning">
                {extractionDegradedCopy}
              </div>
            ) : null}
            {quote ? (
              <QuoteDetailsCard
                documentLabel="QUOTE"
                totalAmount={quote.total_amount}
                taxRate={quote.tax_rate}
                discountType={quote.discount_type}
                discountValue={quote.discount_value}
                depositAmount={quote.deposit_amount}
                lineItemPrices={quote.line_items.map((lineItem) => lineItem.price)}
                clientName={clientName}
                clientContact={clientContact}
              />
            ) : null}
            {quote && !showDraftInvoicePromptBelowActions ? (
              <LinkedInvoiceCard
                linkedInvoice={quote.linked_invoice}
                isConverting={isConvertingInvoice}
                onConvert={onConvertToInvoice}
                onOpenInvoice={(invoiceId) => navigate(`/invoices/${invoiceId}`)}
              />
            ) : null}
            {quote ? <QuoteLineItemsSection lineItems={quote.line_items} /> : null}

            <QuotePreviewActions
              emailActionLabel={emailActionLabel}
              hasCustomerEmail={hasCustomerEmail}
              onGeneratePdf={onGeneratePdf}
              onRequestSendEmail={() => onRequestSendEmail({ hasCustomerEmail, emailActionLabel })}
              onCopyLink={onCopyLink}
              openPdfUrl={openPdfUrl}
              shareUrl={shareUrl}
              manualCopyUrl={manualCopyUrl}
              isGeneratingPdf={isPdfBusy}
              isSendingEmail={isSendingEmail}
              isCopyingLink={isSharing}
              isMarkingWon={isMarkingWon}
              isMarkingLost={isMarkingLost}
              disabled={isLoadingQuote || !!loadError}
              pdfError={resolvedPdfError}
              shareError={shareError}
              outcomeError={outcomeError}
              shareMessage={shareMessage}
            />

            {quote && showDraftInvoicePromptBelowActions ? (
              <LinkedInvoiceCard
                linkedInvoice={quote.linked_invoice}
                isConverting={isConvertingInvoice}
                onConvert={onConvertToInvoice}
                onOpenInvoice={(invoiceId) => navigate(`/invoices/${invoiceId}`)}
                lowEmphasis
              />
            ) : null}

            {deleteError ? (
              <div className="mx-4 mt-3">
                <FeedbackMessage variant="error">{deleteError}</FeedbackMessage>
              </div>
            ) : null}

            {invoiceError ? (
              <div className="mx-4 mt-3">
                <FeedbackMessage variant="error">{invoiceError}</FeedbackMessage>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {quote ? (
        <QuotePreviewDialogs
          quoteLabel={quote.title ?? quote.doc_number}
          emailActionLabel={emailActionLabel}
          customerEmail={customerEmail}
          showDeleteConfirm={showDeleteConfirm}
          showMarkWonConfirm={showMarkWonConfirm}
          showMarkLostConfirm={showMarkLostConfirm}
          showSendEmailConfirm={showSendEmailConfirm}
          showRevokeShareConfirm={showRevokeShareConfirm}
          onDeleteConfirm={() => void onDelete()}
          onDeleteCancel={() => setShowDeleteConfirm(false)}
          onMarkWonConfirm={() => void onConfirmMarkWon()}
          onMarkWonCancel={() => setShowMarkWonConfirm(false)}
          onMarkLostConfirm={() => void onConfirmMarkLost()}
          onMarkLostCancel={() => setShowMarkLostConfirm(false)}
          onSendEmailConfirm={() => void onConfirmSendEmail()}
          onSendEmailCancel={() => setShowSendEmailConfirm(false)}
          onRevokeShareConfirm={() => {
            setShowRevokeShareConfirm(false);
            void onRevokeShare();
          }}
          onRevokeShareCancel={() => setShowRevokeShareConfirm(false)}
        />
      ) : null}

      <BottomNav active="quotes" />
    </main>
  );
}
