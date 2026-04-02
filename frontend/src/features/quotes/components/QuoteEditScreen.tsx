import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { LineItemCard } from "@/features/quotes/components/LineItemCard";
import { HOME_ROUTE } from "@/features/quotes/utils/workflowNavigation";
import { TotalAmountSection } from "@/features/quotes/components/TotalAmountSection";
import { useQuoteEdit, type QuoteEditDraft } from "@/features/quotes/hooks/useQuoteEdit";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { LineItemDraft, LineItemDraftWithFlags, QuoteDetail } from "@/features/quotes/types/quote.types";
import { isQuoteEditableStatus } from "@/features/quotes/utils/quoteStatus";
import { normalizeOptionalTitle } from "@/features/quotes/utils/normalizeOptionalTitle";
import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { ScreenFooter } from "@/shared/components/ScreenFooter";
import { WorkflowScreenHeader } from "@/shared/components/WorkflowScreenHeader";
import {
  calculatePricingFromPersisted,
  getPricingValidationMessage,
  resolveLineItemSum,
} from "@/shared/lib/pricing";

const EMPTY_LINE_ITEM: LineItemDraftWithFlags = {
  description: "",
  details: null,
  price: null,
};

function mapQuoteToEditDraft(quote: QuoteDetail): QuoteEditDraft {
  const lineItemSum = resolveLineItemSum(quote.line_items.map((item) => item.price));
  const breakdown = calculatePricingFromPersisted(
    {
      totalAmount: quote.total_amount,
      taxRate: quote.tax_rate,
      discountType: quote.discount_type,
      discountValue: quote.discount_value,
      depositAmount: quote.deposit_amount,
    },
    lineItemSum,
  );
  return {
    quoteId: quote.id,
    title: quote.title ?? "",
    lineItems: quote.line_items.map((item) => ({
      description: item.description,
      details: item.details,
      price: item.price,
    })),
    total: breakdown.subtotal ?? quote.total_amount,
    taxRate: quote.tax_rate,
    discountType: quote.discount_type,
    discountValue: quote.discount_value,
    depositAmount: quote.deposit_amount,
    notes: quote.notes ?? "",
  };
}

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

export function QuoteEditScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { draft, setDraft, clearDraft } = useQuoteEdit();
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [shouldSkipSeeding, setShouldSkipSeeding] = useState(false);

  useEffect(() => {
    setShouldSkipSeeding(false);

    if (!id) {
      setLoadError("Missing quote id.");
      setIsLoadingQuote(false);
      return;
    }

    const quoteId = id;
    let isActive = true;

    async function fetchQuote(): Promise<void> {
      setIsLoadingQuote(true);
      setLoadError(null);
      try {
        const fetchedQuote = await quoteService.getQuote(quoteId);
        if (isActive) {
          if (!isQuoteEditableStatus(fetchedQuote.status)) {
            setShouldSkipSeeding(true);
            clearDraft();
            navigate(`/quotes/${quoteId}/preview`, { replace: true });
            return;
          }
          setQuote(fetchedQuote);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load quote";
        if (isActive) {
          setLoadError(message);
        }
      } finally {
        if (isActive) {
          setIsLoadingQuote(false);
        }
      }
    }

    void fetchQuote();
    return () => { isActive = false; };
  }, [clearDraft, id, navigate]);

  useEffect(() => {
    if (!quote || shouldSkipSeeding) {
      return;
    }

    if (!draft || draft.quoteId !== quote.id) {
      setDraft(mapQuoteToEditDraft(quote));
    }
  }, [draft, quote, setDraft, shouldSkipSeeding]);

  const currentDraft = draft && quote && draft.quoteId === quote.id ? draft : null;
  const normalizedLineItems = currentDraft?.lineItems.map(normalizeLineItem) ?? [];
  const hasInvalidLineItems = normalizedLineItems.some(isInvalidLineItem);
  const lineItemsForSubmit: LineItemDraft[] = normalizedLineItems
    .filter((lineItem) => lineItem.description.length > 0)
    .map((lineItem) => ({
      description: lineItem.description,
      details: lineItem.details,
      price: lineItem.price,
    }));
  const hasNullPrices = lineItemsForSubmit.some((lineItem) => lineItem.price === null);
  const canSubmit = !isLoadingQuote && !loadError && currentDraft !== null;
  const lineItemSum = normalizedLineItems.reduce((runningTotal, lineItem) => {
    if (lineItem.price === null) {
      return runningTotal;
    }
    return runningTotal + lineItem.price;
  }, 0);
  const draftTitle = currentDraft?.title.trim() ?? "";
  const headerTitle = draftTitle || quote?.doc_number || "Edit Quote";
  const headerSubtitle = quote
    ? draftTitle
      ? `${quote.doc_number} · QUOTE EDITOR`
      : "QUOTE EDITOR"
    : undefined;

  function updateDraft(updater: (current: QuoteEditDraft) => QuoteEditDraft): void {
    if (!currentDraft) {
      return;
    }
    setDraft(updater);
  }

  function onCancel(): void {
    setShouldSkipSeeding(true);
    clearDraft();
    if (id) {
      navigate(`/quotes/${id}/preview`, { replace: true });
      return;
    }
    navigate(HOME_ROUTE, { replace: true });
  }

  function onLineItemAdd(): void {
    setSaveError(null);
    updateDraft((nextDraft) => ({
      ...nextDraft,
      lineItems: [...nextDraft.lineItems, { ...EMPTY_LINE_ITEM }],
    }));
  }

  async function onSave(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!id || !currentDraft) {
      return;
    }

    setSaveError(null);

    if (hasInvalidLineItems) {
      setSaveError("Each line item with details or price needs a description.");
      return;
    }

    if (lineItemsForSubmit.length === 0) {
      setSaveError("Add at least one line item description before saving the quote.");
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
      await quoteService.updateQuote(id, {
        title: normalizeOptionalTitle(currentDraft.title),
        line_items: lineItemsForSubmit,
        total_amount: currentDraft.total,
        tax_rate: currentDraft.taxRate,
        discount_type: currentDraft.discountType,
        discount_value: currentDraft.discountValue,
        deposit_amount: currentDraft.depositAmount,
        notes: currentDraft.notes.trim().length > 0 ? currentDraft.notes.trim() : null,
      });
      setShouldSkipSeeding(true);
      clearDraft();
      navigate(`/quotes/${id}/preview`, { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save quote";
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-28">
      <WorkflowScreenHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        backLabel="Cancel edit"
        onBack={onCancel}
        onExitHome={() => navigate(HOME_ROUTE, { replace: true })}
      />

      <form
        id="quote-edit-form"
        className="mx-auto w-full max-w-2xl space-y-5 px-4 pb-24 pt-20"
        onSubmit={onSave}
      >
        {isLoadingQuote ? (
          <p role="status" className="text-sm text-on-surface-variant">
            Loading quote...
          </p>
        ) : null}

        {loadError ? (
          <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
        ) : null}

        {saveError ? (
          <FeedbackMessage variant="error">{saveError}</FeedbackMessage>
        ) : null}

        {quote && currentDraft ? (
          <>
            <section className="space-y-2">
              <label
                htmlFor="quote-edit-title"
                className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline"
              >
                QUOTE TITLE
              </label>
              <input
                id="quote-edit-title"
                type="text"
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

            <div className="flex items-end justify-between border-b border-outline-variant/20 pb-2">
              <h2 className="font-headline text-xl font-bold tracking-tight text-primary">
                Line Items
              </h2>
              <span className="text-[0.6875rem] uppercase tracking-widest text-outline">
                {currentDraft.lineItems.length} ITEMS
              </span>
            </div>

            <div className="space-y-2.5">
              {currentDraft.lineItems.length > 0 ? (
                currentDraft.lineItems.map((lineItem, index) => (
                  <LineItemCard
                    key={`quote-edit-line-item-${index}`}
                    description={lineItem.description || "Untitled line item"}
                    details={lineItem.details}
                    price={lineItem.price}
                    flagged={lineItem.flagged}
                    onClick={() => navigate(`/quotes/${id}/edit/line-items/${index}/edit`)}
                  />
                ))
              ) : (
                <p className="rounded-lg bg-surface-container-lowest p-4 text-sm text-outline">
                  No line items on this quote yet.
                </p>
              )}
            </div>

            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-outline-variant/30 py-3 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-low"
              onClick={onLineItemAdd}
            >
              <span className="material-symbols-outlined text-base">add</span>
              + Add Line Item
            </button>

            <div className="space-y-4">
              <TotalAmountSection
                lineItemSum={lineItemSum}
                total={currentDraft.total}
                taxRate={currentDraft.taxRate}
                discountType={currentDraft.discountType}
                discountValue={currentDraft.discountValue}
                depositAmount={currentDraft.depositAmount}
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
                  htmlFor="quote-edit-notes"
                  className="text-xs font-bold uppercase tracking-wider text-outline-variant"
                >
                  CUSTOMER NOTES
                </label>
                <textarea
                  id="quote-edit-notes"
                  rows={3}
                  value={currentDraft.notes}
                  onChange={(event) =>
                    updateDraft((nextDraft) => ({
                      ...nextDraft,
                      notes: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-outline-variant/30 bg-surface-container-high p-4 text-sm text-on-surface placeholder:text-outline/70 outline-none transition-all focus:bg-surface-container-lowest focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="Any notes to include for the customer."
                />
              </section>
            </div>
          </>
        ) : null}
      </form>

      <ScreenFooter>
        <div className="mx-auto w-full max-w-2xl">
          {hasNullPrices ? (
            <p className="mb-2 rounded-lg bg-warning-container px-3 py-2 text-center text-xs text-warning">
              Some line items have no price — the quote will show "TBD" for those items.
            </p>
          ) : null}
          <div className="flex flex-col gap-3">
            <Button
              type="submit"
              form="quote-edit-form"
              variant="primary"
              className="w-full"
              disabled={!canSubmit}
              isLoading={isSaving}
            >
              Save Changes
            </Button>
            <button
              type="button"
              className="w-full rounded-lg border border-outline-variant py-4 font-semibold text-on-surface-variant transition-all active:scale-[0.98]"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </ScreenFooter>
    </main>
  );
}
