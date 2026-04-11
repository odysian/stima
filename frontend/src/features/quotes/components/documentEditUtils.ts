import { invoiceService } from "@/features/invoices/services/invoiceService";
import type { InvoiceDetail } from "@/features/invoices/types/invoice.types";
import { mapInvoiceToEditDraft, mapQuoteToEditDraft, type DocumentEditDraft, type PersistedEditableDocument } from "@/features/quotes/hooks/persistedDocumentDraft";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { LineItemDraft, QuoteUpdateRequest } from "@/features/quotes/types/quote.types";
import { normalizeOptionalTitle } from "@/features/quotes/utils/normalizeOptionalTitle";
import { buildDraftSnapshot } from "@/features/quotes/utils/reviewScreenState";
import { getPricingValidationMessage } from "@/shared/lib/pricing";

export function isInvoiceDocument(document: PersistedEditableDocument): document is InvoiceDetail {
  return "customer" in document;
}

export function buildDefaultInvoiceDueDate(): string {
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + 30);
  const year = nextDate.getFullYear();
  const month = String(nextDate.getMonth() + 1).padStart(2, "0");
  const day = String(nextDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildDocumentSnapshotKey(document: PersistedEditableDocument): string {
  const canonicalDraft = isInvoiceDocument(document)
    ? mapInvoiceToEditDraft(document)
    : mapQuoteToEditDraft(document);
  return JSON.stringify(buildDraftSnapshot(canonicalDraft));
}

export function buildSaveValidationMessage(options: {
  draft: DocumentEditDraft;
  lineItemsForSubmit: LineItemDraft[];
  hasInvalidLineItems: boolean;
}): string | null {
  const { draft, lineItemsForSubmit, hasInvalidLineItems } = options;

  if (lineItemsForSubmit.length === 0) {
    return draft.docType === "invoice"
      ? "Add at least one line item description before saving the invoice."
      : "Add at least one line item description before saving the quote.";
  }

  if (hasInvalidLineItems) {
    return "Each line item with details or price needs a description.";
  }

  return getPricingValidationMessage({
    totalAmount: draft.total,
    taxRate: draft.taxRate,
    discountType: draft.discountType,
    discountValue: draft.discountValue,
    depositAmount: draft.depositAmount,
  });
}

export async function persistDocumentDraft(options: {
  document: PersistedEditableDocument;
  documentId: string;
  draft: DocumentEditDraft;
  lineItemsForSubmit: LineItemDraft[];
}): Promise<void> {
  const { document, documentId, draft, lineItemsForSubmit } = options;

  if (isInvoiceDocument(document)) {
    await invoiceService.updateInvoice(documentId, {
      title: normalizeOptionalTitle(draft.title),
      line_items: lineItemsForSubmit,
      total_amount: draft.total,
      tax_rate: draft.taxRate,
      discount_type: draft.discountType,
      discount_value: draft.discountValue,
      deposit_amount: draft.depositAmount,
      notes: draft.notes.trim().length > 0 ? draft.notes.trim() : null,
      doc_type: draft.docType,
      ...(draft.docType === "invoice" && draft.dueDate.trim().length > 0
        ? { due_date: draft.dueDate }
        : {}),
    });
    return;
  }

  const payload: QuoteUpdateRequest = {
    title: normalizeOptionalTitle(draft.title),
    transcript: draft.transcript ?? "",
    line_items: lineItemsForSubmit,
    total_amount: draft.total,
    tax_rate: draft.taxRate,
    discount_type: draft.discountType,
    discount_value: draft.discountValue,
    deposit_amount: draft.depositAmount,
    notes: draft.notes.trim().length > 0 ? draft.notes.trim() : null,
    doc_type: draft.docType,
    ...(draft.docType === "invoice" && draft.dueDate.trim().length > 0
      ? { due_date: draft.dueDate }
      : {}),
  };

  await quoteService.updateQuote(documentId, payload);
}
