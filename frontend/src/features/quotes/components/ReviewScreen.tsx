import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useQuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import { LineItemRow } from "@/features/quotes/components/LineItemRow";
import type { QuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { LineItemDraft } from "@/features/quotes/types/quote.types";
import { Button } from "@/shared/components/Button";

const EMPTY_LINE_ITEM: LineItemDraft = {
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

export function ReviewScreen(): React.ReactElement | null {
  const navigate = useNavigate();
  const { draft, setDraft, clearDraft } = useQuoteDraft();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!draft) {
      navigate("/", { replace: true });
    }
  }, [draft, navigate]);

  if (!draft) {
    return null;
  }

  const currentDraft: QuoteDraft = draft;
  const hasLineItemWithDescription = currentDraft.lineItems.some(
    (lineItem) => lineItem.description.trim().length > 0,
  );
  const lineItemSum = currentDraft.lineItems.reduce((runningTotal, lineItem) => {
    if (lineItem.price === null) {
      return runningTotal;
    }
    return runningTotal + lineItem.price;
  }, 0);

  function updateDraft(updater: (current: QuoteDraft) => QuoteDraft): void {
    setDraft(updater(currentDraft));
  }

  function onLineItemChange(index: number, updated: LineItemDraft): void {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      lineItems: currentDraft.lineItems.map((lineItem, currentIndex) =>
        currentIndex === index ? updated : lineItem,
      ),
    }));
  }

  function onLineItemDelete(index: number): void {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      lineItems: currentDraft.lineItems.filter((_, currentIndex) => currentIndex !== index),
    }));
  }

  function onLineItemAdd(): void {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      lineItems: [...currentDraft.lineItems, { ...EMPTY_LINE_ITEM }],
    }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaveError(null);
    setIsSaving(true);

    try {
      const createdQuote = await quoteService.createQuote({
        customer_id: currentDraft.customerId,
        transcript: currentDraft.transcript,
        line_items: currentDraft.lineItems,
        total_amount: currentDraft.total,
        notes: currentDraft.notes,
      });
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
                {currentDraft.confidenceNotes.map((note) => (
                  <li key={note}>{note}</li>
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
                  key={`${index}-${lineItem.description}`}
                  item={lineItem}
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
              disabled={!hasLineItemWithDescription}
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
