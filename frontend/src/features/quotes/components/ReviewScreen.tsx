import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { invoiceService } from "@/features/invoices/services/invoiceService";
import { profileService } from "@/features/profile/services/profileService";
import { LineItemCard } from "@/features/quotes/components/LineItemCard";
import { ReviewDocumentTypeSelector, type ReviewDocumentType } from "@/features/quotes/components/ReviewDocumentTypeSelector";
import { ReviewSubmitFooter } from "@/features/quotes/components/ReviewSubmitFooter";
import { TotalAmountSection } from "@/features/quotes/components/TotalAmountSection";
import {
  buildCreatePayload,
  EMPTY_LINE_ITEM,
  getReviewMessages,
  isInvalidLineItem,
  mapExtractedLineItems,
  normalizeLineItem,
} from "@/features/quotes/components/reviewScreenUtils";
import { useQuoteDraft, type QuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { LineItemDraft } from "@/features/quotes/types/quote.types";
import { Button } from "@/shared/components/Button";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { getPricingValidationMessage } from "@/shared/lib/pricing";

export function ReviewScreen(): React.ReactElement | null {
  const navigate = useNavigate();
  const { draft, setDraft, clearDraft } = useQuoteDraft();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isTranscriptEditorVisible, setIsTranscriptEditorVisible] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [documentType, setDocumentType] = useState<ReviewDocumentType>("quote");
  const [suggestedTaxRate, setSuggestedTaxRate] = useState<number | null>(null);
  const hasSubmittedRef = useRef(false);

  useEffect(() => {
    if (!draft && !hasSubmittedRef.current) {
      navigate("/", { replace: true });
    }
  }, [draft, navigate]);

  useEffect(() => {
    let isActive = true;

    async function loadSuggestedTaxRate(): Promise<void> {
      try {
        const profile = await profileService.getProfile();
        if (isActive) {
          setSuggestedTaxRate(profile.default_tax_rate);
        }
      } catch {
        if (isActive) {
          setSuggestedTaxRate(null);
        }
      }
    }

    void loadSuggestedTaxRate();
    return () => {
      isActive = false;
    };
  }, []);

  if (!draft) {
    return null;
  }

  const currentDraft: QuoteDraft = draft;
  const normalizedLineItems = currentDraft.lineItems.map(normalizeLineItem);
  const hasInvalidLineItems = normalizedLineItems.some(isInvalidLineItem);
  const lineItemsForSubmit: LineItemDraft[] = normalizedLineItems
    .filter((lineItem) => lineItem.description.length > 0)
    .map((lineItem) => ({
      description: lineItem.description,
      details: lineItem.details,
      price: lineItem.price,
    }));
  const hasNullPrices = lineItemsForSubmit.some((lineItem) => lineItem.price === null);
  const canSubmit = lineItemsForSubmit.length > 0 && !hasInvalidLineItems;
  const lineItemSum = normalizedLineItems.reduce((runningTotal, lineItem) => {
    if (lineItem.price === null) {
      return runningTotal;
    }
    return runningTotal + lineItem.price;
  }, 0);
  const trimmedTranscript = currentDraft.transcript.trim();
  const reviewMessages = getReviewMessages(currentDraft);
  const isInteractionLocked = isSaving || isRegenerating;

  function updateDraft(updater: (current: QuoteDraft) => QuoteDraft): void {
    setDraft(updater(currentDraft));
  }

  function onLineItemAdd(): void {
    setSaveError(null);
    updateDraft((nextDraft) => ({
      ...nextDraft,
      lineItems: [...nextDraft.lineItems, { ...EMPTY_LINE_ITEM }],
    }));
  }

  async function regenerateFromTranscript(): Promise<void> {
    setSaveError(null);
    setIsRegenerating(true);

    try {
      const extraction = await quoteService.convertNotes(trimmedTranscript);
      setDraft({
        ...currentDraft,
        title: currentDraft.title,
        transcript: extraction.transcript,
        lineItems: mapExtractedLineItems(extraction),
        total: extraction.total,
        taxRate: currentDraft.taxRate,
        discountType: currentDraft.discountType,
        discountValue: currentDraft.discountValue,
        depositAmount: currentDraft.depositAmount,
        confidenceNotes: extraction.confidence_notes,
        notes: currentDraft.notes,
        sourceType: currentDraft.sourceType,
      });
      setIsTranscriptEditorVisible(false);
    } catch (regenerateError) {
      const message = regenerateError instanceof Error
        ? regenerateError.message
        : "Unable to regenerate draft from transcript";
      setSaveError(message);
    } finally {
      setIsRegenerating(false);
    }
  }

  function onRegenerateRequest(): void {
    if (trimmedTranscript.length === 0) {
      setSaveError("Add transcript notes before regenerating the draft.");
      return;
    }

    if (currentDraft.lineItems.length > 0) {
      setShowRegenerateConfirm(true);
      return;
    }

    void regenerateFromTranscript();
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaveError(null);

    if (lineItemsForSubmit.length === 0) {
      setSaveError("Add at least one line item description before generating the quote.");
      return;
    }

    if (hasInvalidLineItems) {
      setSaveError("Each line item with details or price needs a description.");
      return;
    }

    const pricingError = getPricingValidationMessage({
      totalAmount: currentDraft.total,
      taxRate: currentDraft.taxRate,
      discountType: currentDraft.discountType,
      discountValue: currentDraft.discountValue,
      depositAmount: currentDraft.depositAmount,
    });
    if (pricingError) {
      setSaveError(pricingError);
      return;
    }

    setIsSaving(true);

    try {
      const createPayload = buildCreatePayload(currentDraft, lineItemsForSubmit);

      if (documentType === "quote") {
        const createdQuote = await quoteService.createQuote(createPayload);
        hasSubmittedRef.current = true;
        clearDraft();
        navigate(`/quotes/${createdQuote.id}/preview`);
        return;
      }

      const createdInvoice = await invoiceService.createInvoice(createPayload);
      hasSubmittedRef.current = true;
      clearDraft();
      navigate(`/invoices/${createdInvoice.id}`);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : documentType === "quote"
        ? "Unable to create quote"
        : "Unable to create invoice";
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-28">
      <ScreenHeader
        title="Review & Edit"
        backLabel="Back to capture"
        onBack={() => {
          if (isInteractionLocked) {
            return;
          }
          navigate(`/quotes/capture/${currentDraft.customerId}`);
        }}
      />

      <form
        id="quote-review-form"
        className="mx-auto w-full max-w-2xl space-y-6 px-4 pb-24 pt-20"
        onSubmit={onSubmit}
      >
        {saveError ? (
          <FeedbackMessage variant="error">{saveError}</FeedbackMessage>
        ) : null}

        {reviewMessages.length > 0 ? (
          <section className="rounded-lg border border-warning-accent/30 bg-warning-container p-4 text-warning">
            <p className="text-[0.6875rem] font-bold uppercase tracking-widest">
              Review required before generating
            </p>
            <p className="mt-2 text-sm font-medium">
              Check these items so the quote matches the job before you continue.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
              {reviewMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <details className="rounded-lg bg-surface-container-low">
          <summary className="cursor-pointer select-none px-4 py-3 text-xs font-bold uppercase tracking-widest text-outline">
            TRANSCRIPT
          </summary>
          <div className="space-y-4 px-4 pb-4">
            {trimmedTranscript.length > 0 ? (
              <p className="whitespace-pre-wrap text-sm text-on-surface-variant">
                {currentDraft.transcript}
              </p>
            ) : (
              <p className="text-sm text-outline">No transcript captured yet.</p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                disabled={isInteractionLocked}
                className="text-left text-sm font-semibold text-primary underline-offset-4 hover:underline"
                onClick={() => setIsTranscriptEditorVisible((isVisible) => !isVisible)}
              >
                {isTranscriptEditorVisible ? "Hide Transcript Editor" : "Edit Transcript Notes"}
              </button>

              {isTranscriptEditorVisible ? (
                <Button
                  type="button"
                  className="w-full px-4 py-3 sm:w-auto"
                  onClick={onRegenerateRequest}
                  disabled={trimmedTranscript.length === 0 || isInteractionLocked}
                  isLoading={isRegenerating}
                >
                  Regenerate From Transcript
                </Button>
              ) : null}
            </div>

            {isTranscriptEditorVisible ? (
              <section className="space-y-2">
                <label
                  htmlFor="transcript-notes"
                  className="text-xs font-bold uppercase tracking-wider text-outline-variant"
                >
                  TRANSCRIPT NOTES
                </label>
                <textarea
                  id="transcript-notes"
                  rows={6}
                  disabled={isInteractionLocked}
                  value={currentDraft.transcript}
                  onChange={(event) =>
                    updateDraft((nextDraft) => ({
                      ...nextDraft,
                      transcript: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-outline-variant/30 bg-white p-4 text-sm text-on-surface-variant placeholder:text-outline/70 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="Correct the transcript notes before regenerating."
                />
                <p className="text-sm text-outline">
                  Regenerating replaces current line items, total, and AI review notes. Customer
                  notes stay as-is.
                </p>
              </section>
            ) : null}
          </div>
        </details>

        <section className="space-y-2">
          <label
            htmlFor="quote-title"
            className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline"
          >
            QUOTE TITLE
          </label>
          <input
            id="quote-title"
            type="text"
            disabled={isInteractionLocked}
            value={currentDraft.title}
            onChange={(event) =>
              updateDraft((nextDraft) => ({
                ...nextDraft,
                title: event.target.value,
              }))
            }
            className="w-full rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Front yard refresh (optional)"
            maxLength={120}
          />
        </section>

        <div className="flex items-end justify-between">
          <h2 className="font-headline text-xl font-bold tracking-tight text-primary">Line Items</h2>
          <span className="text-[0.6875rem] uppercase tracking-widest text-outline">
            {currentDraft.lineItems.length} ITEMS EXTRACTED
          </span>
        </div>

        <div className="mt-3 space-y-3">
          {currentDraft.lineItems.length > 0 ? (
            currentDraft.lineItems.map((lineItem, index) => (
              <LineItemCard
                key={`line-item-card-${index}`}
                description={lineItem.description || "Untitled line item"}
                details={lineItem.details}
                price={lineItem.price}
                flagged={lineItem.flagged}
                disabled={isInteractionLocked}
                onClick={() => navigate(`/quotes/review/line-items/${index}/edit`)}
              />
            ))
          ) : (
            <p className="rounded-lg bg-surface-container-lowest p-4 text-sm text-outline">
              No line items extracted yet.
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={isInteractionLocked}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-outline-variant/30 py-3 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-low"
          onClick={onLineItemAdd}
        >
          <span className="material-symbols-outlined text-base">add</span>
          Add Line Item
        </button>

        <TotalAmountSection
          lineItemSum={lineItemSum}
          total={currentDraft.total}
          taxRate={currentDraft.taxRate}
          discountType={currentDraft.discountType}
          discountValue={currentDraft.discountValue}
          depositAmount={currentDraft.depositAmount}
          suggestedTaxRate={suggestedTaxRate}
          disabled={isInteractionLocked}
          onTotalChange={(total) => {
            updateDraft((nextDraft) => ({ ...nextDraft, total }));
          }}
          onTaxRateChange={(taxRate) => {
            updateDraft((nextDraft) => ({ ...nextDraft, taxRate }));
          }}
          onDiscountTypeChange={(discountType) => {
            updateDraft((nextDraft) => ({ ...nextDraft, discountType }));
          }}
          onDiscountValueChange={(discountValue) => {
            updateDraft((nextDraft) => ({ ...nextDraft, discountValue }));
          }}
          onDepositAmountChange={(depositAmount) => {
            updateDraft((nextDraft) => ({ ...nextDraft, depositAmount }));
          }}
        />

        <section className="space-y-2">
          <label
            htmlFor="quote-notes"
            className="text-xs font-bold uppercase tracking-wider text-outline-variant"
          >
            CUSTOMER NOTES
          </label>
          <textarea
            id="quote-notes"
            rows={3}
            disabled={isInteractionLocked}
            value={currentDraft.notes}
            onChange={(event) =>
              updateDraft((nextDraft) => ({
                ...nextDraft,
                notes: event.target.value,
              }))
            }
            className="w-full rounded-lg border border-outline-variant/30 bg-white p-4 text-sm text-on-surface-variant placeholder:text-outline/70 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="Any notes to include for the customer."
          />
        </section>

        <ReviewDocumentTypeSelector
          value={documentType}
          disabled={isInteractionLocked}
          onChange={setDocumentType}
        />
      </form>

      <ReviewSubmitFooter
        documentType={documentType}
        hasNullPrices={hasNullPrices}
        canSubmit={canSubmit}
        isInteractionLocked={isInteractionLocked}
        isSaving={isSaving}
      />

      {showRegenerateConfirm ? (
        <ConfirmModal
          title="Replace current draft?"
          body="Regenerating from the edited transcript will replace the current line items, total, and AI review notes."
          confirmLabel="Replace Draft"
          cancelLabel="Keep Current Draft"
          onConfirm={() => {
            setShowRegenerateConfirm(false);
            void regenerateFromTranscript();
          }}
          onCancel={() => setShowRegenerateConfirm(false)}
          variant="destructive"
        />
      ) : null}
    </main>
  );
}
