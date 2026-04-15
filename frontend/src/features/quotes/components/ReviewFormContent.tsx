import { useState } from "react";

import { CaptureDetailsSheet } from "@/features/quotes/components/CaptureDetailsSheet";
import { ReviewCustomerRow } from "@/features/quotes/components/ReviewCustomerRow";
import { ReviewDocumentTypeSelector, type ReviewDocumentType } from "@/features/quotes/components/ReviewDocumentTypeSelector";
import { ReviewLineItemsSection } from "@/features/quotes/components/ReviewLineItemsSection";
import { TotalAmountSection } from "@/features/quotes/components/TotalAmountSection";
import type { ExtractionReviewHiddenDetails, ExtractionTier, HiddenItemState } from "@/features/quotes/types/quote.types";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import {
  DOCUMENT_NOTES_MAX_CHARS,
} from "@/shared/lib/inputLimits";

interface ReviewPendingMarkerProps {
  title: string;
  message: string;
}

function ReviewPendingMarker({ title, message }: ReviewPendingMarkerProps): React.ReactElement {
  return (
    <section className="ghost-shadow rounded-lg border-l-4 border-warning-accent bg-warning-container p-4">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-warning">error</span>
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-warning">{title}</p>
          <p className="text-sm font-medium leading-snug text-warning">{message}</p>
        </div>
      </div>
    </section>
  );
}

interface ReviewFormContentProps {
  customerName: string | null;
  draft: {
    title: string;
    transcript?: string;
    lineItems: Array<{ description: string; details: string | null; price: number | null; flagged?: boolean; flagReason?: string | null }>;
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
  notesReviewPending: boolean;
  pricingReviewPending: boolean;
  extractionTier: ExtractionTier | null;
  extractionDegradedReasonCode: string | null;
  hiddenDetails?: ExtractionReviewHiddenDetails;
  hiddenDetailState?: Record<string, HiddenItemState>;
  lineItemSum: number;
  suggestedTaxRate: number | null;
  isMutatingHiddenItems: boolean;
  onDocumentTypeChange: (nextType: ReviewDocumentType) => void;
  onDueDateChange: (nextDueDate: string) => void;
  onRequestAssignment: () => void;
  onAddVoiceNote: () => void;
  onTitleChange: (nextTitle: string) => void;
  onEditLineItem: (lineItemIndex: number) => void;
  onAddLineItem: () => void;
  onTotalChange: (nextTotal: number | null) => void;
  onTaxRateChange: (nextTaxRate: number | null) => void;
  onDiscountTypeChange: (nextDiscountType: "fixed" | "percent" | null) => void;
  onDiscountValueChange: (nextDiscountValue: number | null) => void;
  onDepositAmountChange: (nextDepositAmount: number | null) => void;
  onNotesChange: (nextNotes: string) => void;
  onReviewHiddenItem: (itemId: string) => Promise<void>;
  onDismissHiddenItem: (itemId: string) => Promise<void>;
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
  notesReviewPending,
  pricingReviewPending,
  extractionTier,
  extractionDegradedReasonCode,
  hiddenDetails,
  hiddenDetailState,
  lineItemSum,
  suggestedTaxRate,
  isMutatingHiddenItems,
  onDocumentTypeChange,
  onDueDateChange,
  onRequestAssignment,
  onAddVoiceNote,
  onTitleChange,
  onEditLineItem,
  onAddLineItem,
  onTotalChange,
  onTaxRateChange,
  onDiscountTypeChange,
  onDiscountValueChange,
  onDepositAmountChange,
  onNotesChange,
  onReviewHiddenItem,
  onDismissHiddenItem,
}: ReviewFormContentProps): React.ReactElement {
  const [isCaptureDetailsOpen, setIsCaptureDetailsOpen] = useState(false);
  const showDueDateField = documentType === "invoice";
  const showQuoteOnlySections = documentType === "quote";
  const showSevereDegradedMarker = extractionTier === "degraded"
    && draft.lineItems.length === 0;
  const hasVisibleAppendSuggestions = Boolean(
    hiddenDetails?.append_suggestions.some((suggestion) => !hiddenDetailState?.[suggestion.id]?.dismissed),
  );
  const hasVisibleUnresolvedSegments = Boolean(
    hiddenDetails?.unresolved_segments.some((segment) => !hiddenDetailState?.[segment.id]?.dismissed),
  );
  const hasHiddenActionableItems = Boolean(
    hiddenDetails
      && (hasVisibleAppendSuggestions
        || hasVisibleUnresolvedSegments
        || hiddenDetails.confidence_notes.length > 0),
  );

  return (
    <form
      id="quote-review-form"
      className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-24 pt-20"
      onSubmit={(event) => event.preventDefault()}
    >
      {locationNotice ? (
        <section className="rounded-lg border border-warning-accent/40 bg-warning-container p-4 text-sm text-warning">
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
        <ReviewPendingMarker
          title="Review Required"
          message={extractionDegradedReasonCode
            ? "Extraction degraded and no line items were found. Review capture details before continuing."
            : "No line items were found from this capture. Review capture details before continuing."}
        />
      ) : null}

      <section className="space-y-2">
        <label
          htmlFor="quote-review-title"
          className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline"
        >
          {documentType === "invoice" ? "INVOICE TITLE" : "QUOTE TITLE"}
        </label>
        <input
          id="quote-review-title"
          type="text"
          value={draft.title}
          maxLength={120}
          disabled={isInteractionLocked}
          onChange={(event) => onTitleChange(event.target.value)}
          className="w-full rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
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
          <label
            htmlFor="document-review-due-date"
            className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline"
          >
            INVOICE DUE DATE
          </label>
          <input
            id="document-review-due-date"
            type="date"
            value={draft.dueDate ?? ""}
            disabled={isInteractionLocked}
            onChange={(event) => onDueDateChange(event.target.value)}
            className="w-full rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </section>
      ) : null}

      {showQuoteOnlySections ? (
        <section className="space-y-2">
          <button
            type="button"
            className="inline-flex w-full cursor-pointer items-center justify-between rounded-lg border border-outline-variant/30 bg-surface-container-high px-4 py-3 text-left transition-colors hover:bg-surface-container-lowest"
            onClick={() => setIsCaptureDetailsOpen(true)}
          >
            <div>
              <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">Capture Details</p>
              <p className="text-sm text-on-surface-variant">
                Suggestions, unresolved details, AI review notes, and transcript.
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5">
              {hasHiddenActionableItems ? (
                <span
                  aria-label="Capture details need review"
                  className="material-symbols-outlined text-[1.125rem] leading-none text-warning"
                >
                  error
                </span>
              ) : null}
              <span className="material-symbols-outlined text-[1rem] leading-none text-outline">chevron_right</span>
            </div>
          </button>
        </section>
      ) : null}

      {pricingReviewPending ? (
        <ReviewPendingMarker
          title="Pricing Pending Review"
          message="Pricing fields were seeded from capture details. Review totals, tax, discount, and deposit."
        />
      ) : null}

      {notesReviewPending ? (
        <ReviewPendingMarker
          title="Notes Pending Review"
          message="Notes were seeded from capture details. Review and adjust before continuing."
        />
      ) : null}

      <ReviewLineItemsSection
        lineItems={draft.lineItems}
        isInteractionLocked={isInteractionLocked}
        onEditLineItem={onEditLineItem}
        showCaptureMoreNotes={showQuoteOnlySections}
        onCaptureMoreNotes={onAddVoiceNote}
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
        <label
          htmlFor="quote-review-notes"
          className="text-xs font-bold uppercase tracking-wider text-outline-variant"
        >
          CUSTOMER NOTES
        </label>
        <textarea
          id="quote-review-notes"
          rows={3}
          maxLength={DOCUMENT_NOTES_MAX_CHARS}
          value={draft.notes}
          disabled={isInteractionLocked}
          onChange={(event) => onNotesChange(event.target.value)}
          className="w-full rounded-lg border border-outline-variant/30 bg-surface-container-high p-4 text-sm text-on-surface placeholder:text-outline/70 outline-none transition-all focus:border-primary focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/20"
          placeholder="Any notes to include for the customer."
        />
      </section>

      {showQuoteOnlySections ? (
        <CaptureDetailsSheet
          open={isCaptureDetailsOpen}
          onClose={() => setIsCaptureDetailsOpen(false)}
          transcript={draft.transcript ?? ""}
          hiddenDetails={hiddenDetails}
          hiddenDetailState={hiddenDetailState}
          onReviewHiddenItem={onReviewHiddenItem}
          onDismissHiddenItem={onDismissHiddenItem}
          isMutating={isMutatingHiddenItems}
        />
      ) : null}
    </form>
  );
}
