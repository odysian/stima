import { useState } from "react";

import { ReviewCustomerRow } from "@/features/quotes/components/ReviewCustomerRow";
import { ReviewLineItemsSection } from "@/features/quotes/components/ReviewLineItemsSection";
import { TotalAmountSection } from "@/features/quotes/components/TotalAmountSection";
import type { QuoteEditDraft } from "@/features/quotes/hooks/useQuoteEdit";
import type { QuoteDetail } from "@/features/quotes/types/quote.types";
import { AIConfidenceBanner } from "@/shared/components/AIConfidenceBanner";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import {
  DOCUMENT_NOTES_MAX_CHARS,
} from "@/shared/lib/inputLimits";

interface ReviewFormContentProps {
  id: string;
  quote: QuoteDetail;
  draft: QuoteEditDraft;
  locationNotice?: string;
  loadError: string | null;
  saveError: string | null;
  saveNotice: string | null;
  requiresCustomerAssignment: boolean;
  canReassignCustomer: boolean;
  isInteractionLocked: boolean;
  hasVisibleConfidenceNotes: boolean;
  confidenceNotes: string[];
  lineItemSum: number;
  suggestedTaxRate: number | null;
  onRequestAssignment: () => void;
  onAddVoiceNote: () => void;
  onDismissConfidence: (noteIndex: number) => void;
  onTitleChange: (nextTitle: string) => void;
  onEditLineItem: (lineItemIndex: number) => void;
  onAddLineItem: () => void;
  onTotalChange: (nextTotal: number | null) => void;
  onTaxRateChange: (nextTaxRate: number | null) => void;
  onDiscountTypeChange: (nextDiscountType: "fixed" | "percent" | null) => void;
  onDiscountValueChange: (nextDiscountValue: number | null) => void;
  onDepositAmountChange: (nextDepositAmount: number | null) => void;
  onNotesChange: (nextNotes: string) => void;
}

export function ReviewFormContent({
  id,
  quote,
  draft,
  locationNotice,
  loadError,
  saveError,
  saveNotice,
  requiresCustomerAssignment,
  canReassignCustomer,
  isInteractionLocked,
  hasVisibleConfidenceNotes,
  confidenceNotes,
  lineItemSum,
  suggestedTaxRate,
  onRequestAssignment,
  onAddVoiceNote,
  onDismissConfidence,
  onTitleChange,
  onEditLineItem,
  onAddLineItem,
  onTotalChange,
  onTaxRateChange,
  onDiscountTypeChange,
  onDiscountValueChange,
  onDepositAmountChange,
  onNotesChange,
}: ReviewFormContentProps): React.ReactElement {
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);

  return (
    <form
      id="quote-review-form"
      className="mx-auto w-full max-w-2xl space-y-5 px-4 pb-24 pt-20"
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

      {saveNotice ? (
        <section className="rounded-lg border border-success/30 bg-success-container px-4 py-3 text-sm text-success">
          {saveNotice}
        </section>
      ) : null}

      <section className="space-y-2">
        <label
          htmlFor="quote-review-title"
          className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline"
        >
          QUOTE TITLE
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
        customerName={quote.customer_name}
        requiresCustomerAssignment={requiresCustomerAssignment}
        canReassignCustomer={canReassignCustomer}
        isInteractionLocked={isInteractionLocked}
        onRequestAssignment={onRequestAssignment}
      />

      <section className="space-y-2">
        <button
          type="button"
          aria-expanded={isTranscriptExpanded}
          aria-controls="quote-review-transcript-panel"
          className="inline-flex cursor-pointer items-center gap-1.5 py-1 text-left text-[0.6875rem] font-bold uppercase tracking-widest text-outline transition-colors hover:text-on-surface-variant"
          onClick={() => setIsTranscriptExpanded((current) => !current)}
        >
          <span>Transcript Notes</span>
          <span className="material-symbols-outlined text-[1rem] leading-none text-outline">
            {isTranscriptExpanded ? "expand_more" : "chevron_right"}
          </span>
        </button>
        {isTranscriptExpanded ? (
          <div
            id="quote-review-transcript-panel"
            className="rounded-lg border border-outline-variant/30 bg-surface-container-high p-4 text-sm leading-6 text-on-surface whitespace-pre-wrap"
          >
            {draft.transcript?.trim().length ? draft.transcript : "No transcript notes captured."}
          </div>
        ) : null}
      </section>

      {hasVisibleConfidenceNotes ? (
        <div className="space-y-2">
          {confidenceNotes.map((note, index) => (
            <AIConfidenceBanner
              key={`review-confidence-note-${id}-${index}`}
              message={note}
              onDismiss={() => onDismissConfidence(index)}
            />
          ))}
        </div>
      ) : null}

      <ReviewLineItemsSection
        lineItems={draft.lineItems}
        isInteractionLocked={isInteractionLocked}
        onEditLineItem={onEditLineItem}
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
    </form>
  );
}
