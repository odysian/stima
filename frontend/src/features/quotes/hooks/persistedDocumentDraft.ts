import type { InvoiceDetail } from "@/features/invoices/types/invoice.types";
import type { LineItemDraftWithFlags, QuoteDetail } from "@/features/quotes/types/quote.types";
import {
  calculatePricingFromPersisted,
  resolveLineItemSum,
  type DiscountType,
} from "@/shared/lib/pricing";

const EDIT_STORAGE_KEY = "stima_document_edit";

export type ReviewDocumentType = "quote" | "invoice";

export interface DocumentEditDraft {
  documentId: string;
  docType: ReviewDocumentType;
  title: string;
  transcript: string;
  lineItems: LineItemDraftWithFlags[];
  total: number | null;
  taxRate: number | null;
  discountType: DiscountType | null;
  discountValue: number | null;
  depositAmount: number | null;
  notes: string;
  dueDate: string;
}

export type PersistedEditableDocument = QuoteDetail | InvoiceDetail;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidLineItemDraft(value: unknown): value is LineItemDraftWithFlags {
  if (!isObject(value)) {
    return false;
  }

  const {
    description,
    details,
    price,
    priceStatus,
    flagged,
    flagReason,
  } = value;

  return (
    typeof description === "string"
    && (details === null || details === undefined || typeof details === "string")
    && (price === null || price === undefined || typeof price === "number")
    && (priceStatus === undefined || priceStatus === "priced" || priceStatus === "included" || priceStatus === "unknown")
    && (flagged === undefined || typeof flagged === "boolean")
    && (flagReason === undefined || flagReason === null || typeof flagReason === "string")
  );
}

function parseStoredDraft(raw: string | null): DocumentEditDraft | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) {
      return null;
    }

    const {
      documentId,
      docType,
      title,
      transcript,
      lineItems,
      total,
      taxRate,
      discountType,
      discountValue,
      depositAmount,
      notes,
      dueDate,
    } = parsed;

    if (
      typeof documentId !== "string"
      || (docType !== "quote" && docType !== "invoice")
      || typeof title !== "string"
      || typeof transcript !== "string"
      || !Array.isArray(lineItems)
      || typeof notes !== "string"
      || typeof dueDate !== "string"
    ) {
      return null;
    }

    if (total !== null && typeof total !== "number") {
      return null;
    }
    if (taxRate !== undefined && taxRate !== null && typeof taxRate !== "number") {
      return null;
    }
    if (
      discountType !== undefined
      && discountType !== null
      && discountType !== "fixed"
      && discountType !== "percent"
    ) {
      return null;
    }
    if (discountValue !== undefined && discountValue !== null && typeof discountValue !== "number") {
      return null;
    }
    if (depositAmount !== undefined && depositAmount !== null && typeof depositAmount !== "number") {
      return null;
    }
    if (!lineItems.every(isValidLineItemDraft)) {
      return null;
    }

    return {
      documentId,
      docType,
      title,
      transcript,
      lineItems,
      total,
      taxRate: typeof taxRate === "number" ? taxRate : null,
      discountType: discountType === "fixed" || discountType === "percent" ? discountType : null,
      discountValue: typeof discountValue === "number" ? discountValue : null,
      depositAmount: typeof depositAmount === "number" ? depositAmount : null,
      notes,
      dueDate,
    };
  } catch {
    return null;
  }
}

export function readDocumentDraftFromStorage(): DocumentEditDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  return parseStoredDraft(window.sessionStorage.getItem(EDIT_STORAGE_KEY));
}

export function persistDocumentDraftToStorage(draft: DocumentEditDraft): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(EDIT_STORAGE_KEY, JSON.stringify(draft));
}

export function clearDocumentDraftFromStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(EDIT_STORAGE_KEY);
}

export function mapQuoteToEditDraft(quote: QuoteDetail): DocumentEditDraft {
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
    documentId: quote.id,
    docType: quote.doc_type === "invoice" ? "invoice" : "quote",
    title: quote.title?.trim() ?? "",
    transcript: quote.transcript,
    lineItems: quote.line_items.map((item) => ({
      description: item.description,
      details: item.details,
      price: item.price,
      priceStatus: item.price_status,
      flagged: item.flagged,
      flagReason: item.flag_reason,
    })),
    total: breakdown.subtotal ?? quote.total_amount,
    taxRate: quote.tax_rate,
    discountType: quote.discount_type,
    discountValue: quote.discount_value,
    depositAmount: quote.deposit_amount,
    notes: quote.notes ?? "",
    dueDate: "due_date" in quote && typeof quote.due_date === "string" ? quote.due_date : "",
  };
}

export function mapInvoiceToEditDraft(invoice: InvoiceDetail): DocumentEditDraft {
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
    documentId: invoice.id,
    docType: "invoice",
    title: invoice.title ?? "",
    transcript: "",
    lineItems: invoice.line_items.map((item) => ({
      description: item.description,
      details: item.details,
      price: item.price,
      priceStatus: item.price_status ?? (item.price !== null ? "priced" : "unknown"),
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

export function mapDocumentToEditDraft(document: PersistedEditableDocument): DocumentEditDraft {
  return "customer" in document
    ? mapInvoiceToEditDraft(document)
    : mapQuoteToEditDraft(document);
}
