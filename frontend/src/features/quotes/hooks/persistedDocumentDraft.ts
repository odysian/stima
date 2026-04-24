import type { InvoiceDetail } from "@/features/invoices/types/invoice.types";
import type { LineItemDraftWithFlags, QuoteDetail } from "@/features/quotes/types/quote.types";
import {
  buildDocumentDraftKey,
  deleteLocalDraft,
  getLocalDraft,
  saveLocalDraft,
} from "@/features/quotes/offline/draftRepository";
import { resolveLineItemAuthoritativeSubtotal } from "@/features/quotes/utils/lineItemDraftTotals";
import { calculatePricingFromPersisted, type DiscountType, type PricingFields } from "@/shared/lib/pricing";

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
    flagged,
    flagReason,
  } = value;

  return (
    typeof description === "string"
    && (details === null || details === undefined || typeof details === "string")
    && (price === null || price === undefined || typeof price === "number")
    && (flagged === undefined || typeof flagged === "boolean")
    && (flagReason === undefined || flagReason === null || typeof flagReason === "string")
  );
}

function parseDraftFromValue(value: unknown): DocumentEditDraft | null {
  if (!isObject(value)) {
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
  } = value;

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
}

function parseStoredDraft(raw: string | null): DocumentEditDraft | null {
  if (!raw) {
    return null;
  }

  try {
    return parseDraftFromValue(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

async function migrateSessionStorageDraftIfPresent(userId: string): Promise<DocumentEditDraft | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const rawDraft = window.sessionStorage.getItem(EDIT_STORAGE_KEY);
  if (!rawDraft) {
    return null;
  }

  const parsedDraft = parseStoredDraft(rawDraft);
  if (parsedDraft) {
    await persistDocumentDraftToIDB(parsedDraft, userId);
  } else {
    console.warn("Discarded malformed document edit draft from sessionStorage migration.");
  }

  window.sessionStorage.removeItem(EDIT_STORAGE_KEY);
  return parsedDraft;
}

export async function readDocumentDraftFromIDB(
  documentId: string,
  docType: ReviewDocumentType,
  userId: string,
): Promise<DocumentEditDraft | null> {
  const draftKey = buildDocumentDraftKey(documentId, docType);
  const persistedRecord = await getLocalDraft<unknown>(draftKey, userId);
  if (persistedRecord) {
    const parsedDraft = parseDraftFromValue(persistedRecord.payload);
    if (!parsedDraft) {
      console.warn("Discarded malformed document edit draft from IndexedDB.");
      return null;
    }
    return parsedDraft;
  }

  const migratedDraft = await migrateSessionStorageDraftIfPresent(userId);
  if (!migratedDraft) {
    return null;
  }
  if (migratedDraft.documentId === documentId && migratedDraft.docType === docType) {
    return migratedDraft;
  }
  return null;
}

export async function persistDocumentDraftToIDB(draft: DocumentEditDraft, userId: string): Promise<void> {
  await saveLocalDraft({
    draftKey: buildDocumentDraftKey(draft.documentId, draft.docType),
    userId,
    docType: draft.docType,
    documentId: draft.documentId,
    payload: draft,
  });
}

export async function clearDocumentDraftFromIDB(
  documentId: string,
  docType: ReviewDocumentType,
): Promise<void> {
  await deleteLocalDraft(buildDocumentDraftKey(documentId, docType));
}

function resolvePersistedDraftSubtotal(
  pricing: PricingFields,
  lineItems: LineItemDraftWithFlags[],
): number | null {
  const authoritativeSubtotal = resolveLineItemAuthoritativeSubtotal(lineItems);
  const breakdown = calculatePricingFromPersisted(
    pricing,
    authoritativeSubtotal.definesSubtotal ? authoritativeSubtotal.subtotal : null,
  );
  return breakdown.subtotal ?? pricing.totalAmount;
}

export function mapQuoteToEditDraft(quote: QuoteDetail): DocumentEditDraft {
  const lineItems = quote.line_items.map((item) => ({
    description: item.description,
    details: item.details,
    price: item.price,
    flagged: item.flagged,
    flagReason: item.flag_reason,
  }));
  const total = resolvePersistedDraftSubtotal(
    {
      totalAmount: quote.total_amount,
      taxRate: quote.tax_rate,
      discountType: quote.discount_type,
      discountValue: quote.discount_value,
      depositAmount: quote.deposit_amount,
    },
    lineItems,
  );

  return {
    documentId: quote.id,
    docType: quote.doc_type === "invoice" ? "invoice" : "quote",
    title: quote.title?.trim() ?? "",
    transcript: quote.transcript,
    lineItems,
    total,
    taxRate: quote.tax_rate,
    discountType: quote.discount_type,
    discountValue: quote.discount_value,
    depositAmount: quote.deposit_amount,
    notes: quote.notes ?? "",
    dueDate: "due_date" in quote && typeof quote.due_date === "string" ? quote.due_date : "",
  };
}

export function mapInvoiceToEditDraft(invoice: InvoiceDetail): DocumentEditDraft {
  const lineItems = invoice.line_items.map((item) => ({
    description: item.description,
    details: item.details,
    price: item.price,
  }));
  const total = resolvePersistedDraftSubtotal(
    {
      totalAmount: invoice.total_amount,
      taxRate: invoice.tax_rate,
      discountType: invoice.discount_type,
      discountValue: invoice.discount_value,
      depositAmount: invoice.deposit_amount,
    },
    lineItems,
  );

  return {
    documentId: invoice.id,
    docType: "invoice",
    title: invoice.title ?? "",
    transcript: "",
    lineItems,
    total,
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
