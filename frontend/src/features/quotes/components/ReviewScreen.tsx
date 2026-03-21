import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useQuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import { LineItemRow } from "@/features/quotes/components/LineItemRow";
import type { QuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { LineItemDraft, LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { Button } from "@/shared/components/Button";

const EMPTY_LINE_ITEM: LineItemDraftWithFlags = {
  description: "",
  details: null,
  price: null,
};

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

export function ReviewScreen(): React.ReactElement | null {
  const navigate = useNavigate();
  const { draft, setDraft, clearDraft } = useQuoteDraft();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const rowIdSequenceRef = useRef(0);
  const hasSubmittedRef = useRef(false);
  const [lineItemRowIds, setLineItemRowIds] = useState<string[]>([]);

  useEffect(() => {
    if (!draft && !hasSubmittedRef.current) {
      navigate("/", { replace: true });
    }
  }, [draft, navigate]);

  useEffect(() => {
    if (!draft) {
      return;
    }

    setLineItemRowIds((currentIds) => {
      if (currentIds.length === draft.lineItems.length) {
        return currentIds;
      }

      const nextIds = currentIds.slice(0, draft.lineItems.length);
      while (nextIds.length < draft.lineItems.length) {
        nextIds.push(`line-item-${rowIdSequenceRef.current}`);
        rowIdSequenceRef.current += 1;
      }
      return nextIds;
    });
  }, [draft]);

  if (!draft) {
    return null;
  }

  const currentDraft: QuoteDraft = draft;
  const normalizedLineItems = currentDraft.lineItems.map(normalizeLineItem);
  const lineItemsForSubmit: LineItemDraft[] = normalizedLineItems
    .filter((lineItem) => lineItem.description.length > 0)
    .map((lineItem) => ({
      description: lineItem.description,
      details: lineItem.details,
      price: lineItem.price,
    }));
  const hasInvalidLineItems = normalizedLineItems.some(isInvalidLineItem);
  const canSubmit = lineItemsForSubmit.length > 0 && !hasInvalidLineItems;
  const lineItemSum = normalizedLineItems.reduce((runningTotal, lineItem) => {
    if (lineItem.price === null) {
      return runningTotal;
    }
    return runningTotal + lineItem.price;
  }, 0);

  function updateDraft(updater: (current: QuoteDraft) => QuoteDraft): void {
    setDraft(updater(currentDraft));
  }

  function onLineItemChange(index: number, updated: LineItemDraftWithFlags): void {
    setSaveError(null);
    updateDraft((currentDraft) => ({
      ...currentDraft,
      lineItems: currentDraft.lineItems.map((lineItem, currentIndex) =>
        currentIndex === index ? updated : lineItem,
      ),
    }));
  }

  function onLineItemDelete(index: number): void {
    setSaveError(null);
    setLineItemRowIds((currentIds) => currentIds.filter((_, currentIndex) => currentIndex !== index));
    updateDraft((currentDraft) => ({
      ...currentDraft,
      lineItems: currentDraft.lineItems.filter((_, currentIndex) => currentIndex !== index),
    }));
  }

  function onLineItemAdd(): void {
    setSaveError(null);
    setLineItemRowIds((currentIds) => {
      const nextIds = [...currentIds, `line-item-${rowIdSequenceRef.current}`];
      rowIdSequenceRef.current += 1;
      return nextIds;
    });
    updateDraft((currentDraft) => ({
      ...currentDraft,
      lineItems: [...currentDraft.lineItems, { ...EMPTY_LINE_ITEM }],
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
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <section className="w-full max-w-5xl rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Review extracted draft</h1>
        <p className="mt-2 text-sm text-slate-600">
          Edit line items, total, and notes before generating the quote.
        </p>

        {saveError ? (
          <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {saveError}
          </p>
        ) : null}

        <form className="mt-6 flex flex-col gap-6" onSubmit={onSubmit}>
          <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-sm font-semibold text-slate-800">Transcript</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{currentDraft.transcript}</p>
          </section>

          {currentDraft.confidenceNotes.length > 0 ? (
            <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-sm font-semibold text-amber-900">Confidence notes</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                {currentDraft.confidenceNotes.map((note, index) => (
                  <li key={`${index}-${note}`}>{note}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Line items</h2>
              <Button type="button" onClick={onLineItemAdd}>
                Add line item
              </Button>
            </div>

            {currentDraft.lineItems.length > 0 ? (
              currentDraft.lineItems.map((lineItem, index) => (
                <LineItemRow
                  key={lineItemRowIds[index] ?? `line-item-fallback-${index}`}
                  rowId={lineItemRowIds[index] ?? `line-item-fallback-${index}`}
                  item={lineItem}
                  descriptionError={
                    isInvalidLineItem(normalizedLineItems[index])
                      ? "Description is required for this row."
                      : null
                  }
                  onChange={(updatedItem) => onLineItemChange(index, updatedItem)}
                  onDelete={() => onLineItemDelete(index)}
                />
              ))
            ) : (
              <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                No line items yet. Add one to continue.
              </p>
            )}
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="quote-total" className="text-sm font-medium text-slate-700">
                Total amount
              </label>
              <input
                id="quote-total"
                type="number"
                step="0.01"
                value={currentDraft.total ?? ""}
                onChange={(event) => {
                  const rawValue = event.target.value.trim();
                  if (rawValue === "") {
                    updateDraft((currentDraft) => ({ ...currentDraft, total: null }));
                    return;
                  }
                  const parsedValue = Number(rawValue);
                  updateDraft((currentDraft) => ({
                    ...currentDraft,
                    total: Number.isFinite(parsedValue) ? parsedValue : null,
                  }));
                }}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Line item sum
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(lineItemSum)}</p>
            </div>
          </section>

          <section className="flex flex-col gap-1">
            <label htmlFor="quote-notes" className="text-sm font-medium text-slate-700">
              Notes
            </label>
            <textarea
              id="quote-notes"
              rows={4}
              value={currentDraft.notes}
              onChange={(event) =>
                updateDraft((currentDraft) => ({
                  ...currentDraft,
                  notes: event.target.value,
                }))
              }
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </section>

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={!canSubmit}
              isLoading={isSaving}
            >
              Generate Quote PDF
            </Button>
            <Button type="button" onClick={() => navigate("/quotes/new")}>
              Cancel
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
