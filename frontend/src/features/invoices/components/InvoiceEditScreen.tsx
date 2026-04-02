import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { invoiceService } from "@/features/invoices/services/invoiceService";
import { HOME_ROUTE } from "@/features/quotes/utils/workflowNavigation";
import { useInvoiceEdit, type InvoiceEditDraft } from "@/features/invoices/hooks/useInvoiceEdit";
import type { InvoiceDetail } from "@/features/invoices/types/invoice.types";
import { isInvoiceEditableStatus } from "@/features/invoices/utils/invoiceStatus";
import { LineItemCard } from "@/features/quotes/components/LineItemCard";
import { TotalAmountSection } from "@/features/quotes/components/TotalAmountSection";
import type { LineItemDraft, LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
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

function mapInvoiceToEditDraft(invoice: InvoiceDetail): InvoiceEditDraft {
  const lineItemSum = resolveLineItemSum(invoice.line_items.map((item) => item.price));
  const breakdown = calculatePricingFromPersisted(
    {
      totalAmount: invoice.total_amount,
      taxRate: invoice.tax_rate,
      discountType: invoice.discount_type,
      discountValue: invoice.discount_value,
      depositAmount: invoice.deposit_amount,
    },
    lineItemSum,
  );
  return {
    invoiceId: invoice.id,
    title: invoice.title ?? "",
    lineItems: invoice.line_items.map((item) => ({
      description: item.description,
      details: item.details,
      price: item.price,
    })),
    total: breakdown.subtotal ?? invoice.total_amount,
    taxRate: invoice.tax_rate,
    discountType: invoice.discount_type,
    discountValue: invoice.discount_value,
    depositAmount: invoice.deposit_amount,
    notes: invoice.notes ?? "",
    dueDate: invoice.due_date ?? "",
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

export function InvoiceEditScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { draft, setDraft, clearDraft } = useInvoiceEdit();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [isLoadingInvoice, setIsLoadingInvoice] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [shouldSkipSeeding, setShouldSkipSeeding] = useState(false);

  useEffect(() => {
    setShouldSkipSeeding(false);

    if (!id) {
      setLoadError("Missing invoice id.");
      setIsLoadingInvoice(false);
      return;
    }

    const invoiceId = id;
    let isActive = true;

    async function fetchInvoice(): Promise<void> {
      setIsLoadingInvoice(true);
      setLoadError(null);
      try {
        const fetchedInvoice = await invoiceService.getInvoice(invoiceId);
        if (isActive) {
          if (!isInvoiceEditableStatus(fetchedInvoice.status)) {
            setShouldSkipSeeding(true);
            clearDraft();
            navigate(`/invoices/${invoiceId}`, { replace: true });
            return;
          }
          setInvoice(fetchedInvoice);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load invoice";
        if (isActive) {
          setLoadError(message);
        }
      } finally {
        if (isActive) {
          setIsLoadingInvoice(false);
        }
      }
    }

    void fetchInvoice();
    return () => {
      isActive = false;
    };
  }, [clearDraft, id, navigate]);

  useEffect(() => {
    if (!invoice || shouldSkipSeeding) {
      return;
    }

    if (!draft || draft.invoiceId !== invoice.id) {
      setDraft(mapInvoiceToEditDraft(invoice));
    }
  }, [draft, invoice, setDraft, shouldSkipSeeding]);

  const currentDraft = draft && invoice && draft.invoiceId === invoice.id ? draft : null;
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
  const canSubmit = !isLoadingInvoice && !loadError && currentDraft !== null;
  const lineItemSum = normalizedLineItems.reduce((runningTotal, lineItem) => {
    if (lineItem.price === null) {
      return runningTotal;
    }
    return runningTotal + lineItem.price;
  }, 0);
  const draftTitle = currentDraft?.title.trim() ?? "";
  const headerTitle = draftTitle || invoice?.doc_number || "Edit Invoice";
  const headerSubtitle = invoice
    ? draftTitle
      ? `${invoice.doc_number} · INVOICE EDITOR`
      : "INVOICE EDITOR"
    : undefined;

  function updateDraft(updater: (current: InvoiceEditDraft) => InvoiceEditDraft): void {
    if (!currentDraft) {
      return;
    }
    setDraft(updater);
  }

  function onCancel(): void {
    setShouldSkipSeeding(true);
    clearDraft();
    if (id) {
      navigate(`/invoices/${id}`, { replace: true });
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
      setSaveError("Add at least one line item description before saving the invoice.");
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
      const updatePayload = {
        title: normalizeOptionalTitle(currentDraft.title),
        line_items: lineItemsForSubmit,
        total_amount: currentDraft.total,
        tax_rate: currentDraft.taxRate,
        discount_type: currentDraft.discountType,
        discount_value: currentDraft.discountValue,
        deposit_amount: currentDraft.depositAmount,
        notes: currentDraft.notes.trim().length > 0 ? currentDraft.notes.trim() : null,
        ...(currentDraft.dueDate ? { due_date: currentDraft.dueDate } : {}),
      };
      await invoiceService.updateInvoice(id, updatePayload);
      setShouldSkipSeeding(true);
      clearDraft();
      navigate(`/invoices/${id}`, { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save invoice";
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
        id="invoice-edit-form"
        className="mx-auto w-full max-w-2xl space-y-5 px-4 pb-24 pt-20"
        onSubmit={onSave}
      >
        {isLoadingInvoice ? (
          <p role="status" className="text-sm text-on-surface-variant">
            Loading invoice...
          </p>
        ) : null}

        {loadError ? (
          <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
        ) : null}

        {saveError ? (
          <FeedbackMessage variant="error">{saveError}</FeedbackMessage>
        ) : null}

        {invoice && currentDraft ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 md:items-end">
              <div className="space-y-2">
                <label
                  htmlFor="invoice-edit-title"
                  className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline"
                >
                  INVOICE TITLE
                </label>
                <input
                  id="invoice-edit-title"
                  type="text"
                  value={currentDraft.title}
                  onChange={(event) =>
                    updateDraft((nextDraft) => ({
                      ...nextDraft,
                      title: event.target.value,
                    }))}
                  className="w-full rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Front yard refresh (optional)"
                  maxLength={120}
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="invoice-edit-due-date"
                  className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline"
                >
                  INVOICE DUE DATE
                </label>
                <input
                  id="invoice-edit-due-date"
                  type="date"
                  value={currentDraft.dueDate}
                  onChange={(event) =>
                    updateDraft((nextDraft) => ({
                      ...nextDraft,
                      dueDate: event.target.value,
                    }))}
                  className="w-full rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
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
                    key={`invoice-edit-line-item-${index}`}
                    description={lineItem.description || "Untitled line item"}
                    details={lineItem.details}
                    price={lineItem.price}
                    flagged={lineItem.flagged}
                    onClick={() => navigate(`/invoices/${id}/edit/line-items/${index}/edit`)}
                  />
                ))
              ) : (
                <p className="rounded-lg bg-surface-container-lowest p-4 text-sm text-outline">
                  No line items on this invoice yet.
                </p>
              )}
            </div>

            <button
              type="button"
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-outline-variant/30 py-3 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-low"
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
                  htmlFor="invoice-edit-notes"
                  className="text-xs font-bold uppercase tracking-wider text-outline-variant"
                >
                  CUSTOMER NOTES
                </label>
                <textarea
                  id="invoice-edit-notes"
                  rows={3}
                  value={currentDraft.notes}
                  onChange={(event) =>
                    updateDraft((nextDraft) => ({
                      ...nextDraft,
                      notes: event.target.value,
                    }))}
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
              Some line items have no price — the invoice will show "TBD" for those items.
            </p>
          ) : null}
          <div className="flex flex-col gap-3">
            <Button
              type="submit"
              form="invoice-edit-form"
              variant="primary"
              className="w-full"
              disabled={!canSubmit}
              isLoading={isSaving}
            >
              Save Changes
            </Button>
            <button
              type="button"
              className="w-full cursor-pointer rounded-lg border border-outline-variant py-4 font-semibold text-on-surface-variant transition-all active:scale-[0.98]"
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
