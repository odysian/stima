import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { LineItemCard } from "@/features/quotes/components/LineItemCard";
import { TotalAmountSection } from "@/features/quotes/components/TotalAmountSection";
import { useQuoteDraft, type QuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { LineItemDraft, LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { AIConfidenceBanner } from "@/shared/components/AIConfidenceBanner";
import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { ScreenFooter } from "@/shared/components/ScreenFooter";
import { ScreenHeader } from "@/shared/components/ScreenHeader";

const EMPTY_LINE_ITEM: LineItemDraftWithFlags = {
  description: "",
  details: null,
  price: null,
};

function normalizeLineItem(item: LineItemDraftWithFlags): LineItemDraftWithFlags {
  const normalizedDetails = item.details?.trim() ?? "";
  return {
    description: item.description.trim(),
    details: normalizedDetails.length > 0 ? normalizedDetails : null,
    price: item.price,
    flagged: item.flagged,
    flagReason: item.flagReason,
  };
}

function isBlankLineItem(item: LineItemDraftWithFlags): boolean {
  return item.description.length === 0 && item.details === null && item.price === null;
}

function isInvalidLineItem(item: LineItemDraftWithFlags): boolean {
  return item.description.length === 0 && !isBlankLineItem(item);
}

export function ReviewScreen(): React.ReactElement | null {
  const navigate = useNavigate();
  const { draft, setDraft, clearDraft } = useQuoteDraft();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const hasSubmittedRef = useRef(false);

  useEffect(() => {
    if (!draft && !hasSubmittedRef.current) {
      navigate("/", { replace: true });
    }
  }, [draft, navigate]);

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
  const hasFlaggedItems = currentDraft.lineItems.some((lineItem) => lineItem.flagged);
  const shouldRenderAiBanner = currentDraft.confidenceNotes.length > 0 || hasFlaggedItems;
  const confidenceMessage = currentDraft.confidenceNotes.length > 0
    ? currentDraft.confidenceNotes.join(" ")
    : "One or more line items were flagged for review.";

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

    setIsSaving(true);

    try {
      const createdQuote = await quoteService.createQuote({
        customer_id: currentDraft.customerId,
        transcript: currentDraft.transcript,
        line_items: lineItemsForSubmit,
        total_amount: currentDraft.total,
        notes: currentDraft.notes,
        source_type: currentDraft.sourceType,
      });
      hasSubmittedRef.current = true;
      clearDraft();
      navigate(`/quotes/${createdQuote.id}/preview`);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Unable to create quote";
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
        onBack={() => navigate(`/quotes/capture/${currentDraft.customerId}`)}
      />

      <form
        id="quote-review-form"
        className="mx-auto w-full max-w-2xl space-y-6 px-4 pb-24 pt-20"
        onSubmit={onSubmit}
      >
        {saveError ? (
          <FeedbackMessage variant="error">{saveError}</FeedbackMessage>
        ) : null}

        {shouldRenderAiBanner ? <AIConfidenceBanner message={confidenceMessage} /> : null}

        <div className="flex items-end justify-between border-b border-outline-variant/20 pb-2">
          <h2 className="font-headline text-xl font-bold tracking-tight text-primary">Line Items</h2>
          <span className="text-[0.6875rem] uppercase tracking-widest text-outline">
            {currentDraft.lineItems.length} ITEMS EXTRACTED
          </span>
        </div>

        <div className="space-y-3">
          {currentDraft.lineItems.length > 0 ? (
            currentDraft.lineItems.map((lineItem, index) => (
              <LineItemCard
                key={`line-item-card-${index}-${lineItem.description}-${lineItem.details ?? ""}`}
                description={lineItem.description || "Untitled line item"}
                details={lineItem.details}
                price={lineItem.price}
                flagged={lineItem.flagged}
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
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-outline-variant/30 py-3 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-low"
          onClick={onLineItemAdd}
        >
          <span className="material-symbols-outlined text-base">add</span>
          + Add Manual Line Item
        </button>

        <TotalAmountSection
          lineItemSum={lineItemSum}
          total={currentDraft.total}
          onTotalChange={(total) => {
            updateDraft((nextDraft) => ({ ...nextDraft, total }));
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
      </form>

      <ScreenFooter>
        <div className="mx-auto w-full max-w-2xl">
          {hasNullPrices ? (
            <p className="mb-2 rounded-lg bg-warning-container px-3 py-2 text-center text-xs text-warning">
              Some line items have no price — the quote will show "TBD" for those items.
            </p>
          ) : null}
          <Button
            type="submit"
            form="quote-review-form"
            variant="primary"
            className="w-full"
            disabled={!canSubmit}
            isLoading={isSaving}
          >
            Generate Quote {">"}
          </Button>
        </div>
      </ScreenFooter>
    </main>
  );
}
