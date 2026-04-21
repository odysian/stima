import { ReviewCustomerRow } from "@/features/quotes/components/ReviewCustomerRow";
import { ReviewDocumentTypeSelector, type ReviewDocumentType } from "@/features/quotes/components/ReviewDocumentTypeSelector";
import { ReviewLineItemsSection } from "@/features/quotes/components/ReviewLineItemsSection";
import { TotalAmountSection } from "@/features/quotes/components/TotalAmountSection";
import type { ExtractionTier } from "@/features/quotes/types/quote.types";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import {
  DOCUMENT_NOTES_MAX_CHARS,
} from "@/shared/lib/inputLimits";
import { Banner } from "@/ui/Banner";
import { Eyebrow } from "@/ui/Eyebrow";

interface ReviewFormContentProps {
  customerName: string | null;
  draft: {
    title: string;
    transcript?: string;
    lineItems: Array<{
      description: string;
      details: string | null;
      price: number | null;
      flagged?: boolean;
      flagReason?: string | null;
    }>;
    total: number | null;
    taxRate: number | null;
    discountType: "fixed" | "percent" | null;
    discountValue: number | null;
    depositAmount: number | null;
    notes: string;
    dueDate?: string;
  };
  documentType: ReviewDocumentType;
  isTypeSelectorLocked: boolean;
  isInvoiceTypeDisabled: boolean;
  locationNotice?: string;
  loadError: string | null;
  saveError: string | null;
  requiresCustomerAssignment: boolean;
  canReassignCustomer: boolean;
  isInteractionLocked: boolean;
  extractionTier: ExtractionTier | null;
  extractionDegradedReasonCode: string | null;
  lineItemSum: number;
  suggestedTaxRate: number | null;
  onDocumentTypeChange: (nextType: ReviewDocumentType) => void;
  onDueDateChange: (nextDueDate: string) => void;
  onRequestAssignment: () => void;
  onTitleChange: (nextTitle: string) => void;
  onEditLineItem: (lineItemIndex: number) => void;
  onReorderLineItems: (sourceIndex: number, targetIndex: number) => void;
  onAddLineItem: () => void;
  onTotalChange: (nextTotal: number | null) => void;
  onTaxRateChange: (nextTaxRate: number | null) => void;
  onDiscountTypeChange: (nextDiscountType: "fixed" | "percent" | null) => void;
  onDiscountValueChange: (nextDiscountValue: number | null) => void;
  onDepositAmountChange: (nextDepositAmount: number | null) => void;
  onNotesChange: (nextNotes: string) => void;
}

export function ReviewFormContent({
  customerName,
  draft,
  documentType,
  isTypeSelectorLocked,
  isInvoiceTypeDisabled,
  locationNotice,
  loadError,
  saveError,
  requiresCustomerAssignment,
  canReassignCustomer,
  isInteractionLocked,
  extractionTier,
  extractionDegradedReasonCode,
  lineItemSum,
  suggestedTaxRate,
  onDocumentTypeChange,
  onDueDateChange,
  onRequestAssignment,
  onTitleChange,
  onEditLineItem,
  onReorderLineItems,
  onAddLineItem,
  onTotalChange,
  onTaxRateChange,
  onDiscountTypeChange,
  onDiscountValueChange,
  onDepositAmountChange,
  onNotesChange,
}: ReviewFormContentProps): React.ReactElement {
  const showDueDateField = documentType === "invoice";
  const showSevereDegradedMarker = extractionTier === "degraded"
    && draft.lineItems.length === 0;

  return (
    <form
      id="quote-review-form"
      className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-24 pt-20"
      onSubmit={(event) => event.preventDefault()}
    >
      {locationNotice ? (
        <section className="ghost-shadow rounded-[var(--radius-document)] border-l-4 border-warning-accent bg-warning-container p-4 text-sm text-warning backdrop-blur-md">
          {locationNotice}
        </section>
      ) : null}

      {loadError ? (
        <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
      ) : null}

      {saveError ? (
        <FeedbackMessage variant="error">{saveError}</FeedbackMessage>
      ) : null}

      {showSevereDegradedMarker ? (
        <Banner
          title="Review Required"
          message={extractionDegradedReasonCode
            ? "Extraction degraded and no line items were found. Review capture details before continuing."
            : "No line items were found from this capture. Review capture details before continuing."}
        />
      ) : null}

      <section className="space-y-2">
        <label htmlFor="quote-review-title">
          <Eyebrow>
          {documentType === "invoice" ? "INVOICE TITLE" : "QUOTE TITLE"}
          </Eyebrow>
        </label>
        <input
          id="quote-review-title"
          type="text"
          value={draft.title}
          maxLength={120}
          disabled={isInteractionLocked}
          onChange={(event) => onTitleChange(event.target.value)}
          className="w-full rounded-[var(--radius-document)] bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Front yard refresh (optional)"
        />
      </section>

      <ReviewCustomerRow
        customerName={customerName}
        requiresCustomerAssignment={requiresCustomerAssignment}
        canReassignCustomer={canReassignCustomer}
        isInteractionLocked={isInteractionLocked}
        onRequestAssignment={onRequestAssignment}
      />

      <ReviewDocumentTypeSelector
        value={documentType}
        disabled={isTypeSelectorLocked}
        isInvoiceDisabled={isInvoiceTypeDisabled}
        onChange={onDocumentTypeChange}
      />

      {showDueDateField ? (
        <section className="space-y-2">
          <label htmlFor="document-review-due-date">
            <Eyebrow>INVOICE DUE DATE</Eyebrow>
          </label>
          <input
            id="document-review-due-date"
            type="date"
            value={draft.dueDate ?? ""}
            disabled={isInteractionLocked}
            onChange={(event) => onDueDateChange(event.target.value)}
            className="w-full rounded-[var(--radius-document)] bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </section>
      ) : null}

      <ReviewLineItemsSection
        lineItems={draft.lineItems}
        isInteractionLocked={isInteractionLocked}
        onEditLineItem={onEditLineItem}
        onReorderLineItems={onReorderLineItems}
        onAddLineItem={onAddLineItem}
      />

      <TotalAmountSection
        lineItemSum={lineItemSum}
        total={draft.total}
        taxRate={draft.taxRate}
        discountType={draft.discountType}
        discountValue={draft.discountValue}
        depositAmount={draft.depositAmount}
        suggestedTaxRate={suggestedTaxRate}
        disabled={isInteractionLocked}
        onTotalChange={onTotalChange}
        onTaxRateChange={onTaxRateChange}
        onDiscountTypeChange={onDiscountTypeChange}
        onDiscountValueChange={onDiscountValueChange}
        onDepositAmountChange={onDepositAmountChange}
      />

      <section className="space-y-2">
        <label htmlFor="quote-review-notes">
          <Eyebrow>CUSTOMER NOTES</Eyebrow>
        </label>
        <textarea
          id="quote-review-notes"
          rows={3}
          maxLength={DOCUMENT_NOTES_MAX_CHARS}
          value={draft.notes}
          disabled={isInteractionLocked}
          onChange={(event) => onNotesChange(event.target.value)}
          className="w-full rounded-[var(--radius-document)] border border-outline-variant/30 bg-surface-container-high p-4 text-sm text-on-surface placeholder:text-outline/70 outline-none transition-all focus:border-primary focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/20"
          placeholder="Any notes to include for the customer."
        />
      </section>
    </form>
  );
}
