import type { LineItemDraftWithFlags, QuoteSourceType } from "@/features/quotes/types/quote.types";
import {
  buildCaptureHandoffDraftKey,
  CAPTURE_HANDOFF_DOCUMENT_ID,
  getLocalDraft,
  saveLocalDraft,
} from "@/features/quotes/offline/draftRepository";
import type { QuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";

const DRAFT_STORAGE_KEY = "stima_quote_draft";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseDraftFromValue(value: unknown): QuoteDraft | null {
  if (!isObject(value)) {
    return null;
  }

  const {
    customerId,
    quoteId,
    launchOrigin,
    title,
    transcript,
    lineItems,
    total,
    taxRate,
    discountType,
    discountValue,
    depositAmount,
    notes,
    sourceType,
  } = value;

  if (
    typeof customerId !== "string" ||
    (quoteId !== undefined && typeof quoteId !== "string") ||
    (launchOrigin !== undefined && typeof launchOrigin !== "string") ||
    (title !== undefined && typeof title !== "string") ||
    typeof transcript !== "string" ||
    !Array.isArray(lineItems) ||
    typeof notes !== "string"
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

  const parsedSourceType: QuoteSourceType =
    sourceType === "voice" || sourceType === "text" || sourceType === "voice+text"
      ? sourceType
      : "text";

  return {
    customerId,
    quoteId: typeof quoteId === "string" ? quoteId : undefined,
    launchOrigin: typeof launchOrigin === "string" ? launchOrigin : "/",
    title: typeof title === "string" ? title : "",
    transcript,
    lineItems: lineItems as LineItemDraftWithFlags[],
    total,
    taxRate: typeof taxRate === "number" ? taxRate : null,
    discountType: discountType === "fixed" || discountType === "percent" ? discountType : null,
    discountValue: typeof discountValue === "number" ? discountValue : null,
    depositAmount: typeof depositAmount === "number" ? depositAmount : null,
    notes,
    sourceType: parsedSourceType,
  };
}

function parseStoredDraft(raw: string | null): QuoteDraft | null {
  if (!raw) {
    return null;
  }

  try {
    return parseDraftFromValue(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

async function migrateSessionStorageDraftIfPresent(userId: string): Promise<QuoteDraft | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const rawDraft = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
  if (!rawDraft) {
    return null;
  }

  const parsedDraft = parseStoredDraft(rawDraft);
  if (parsedDraft) {
    await saveLocalDraft({
      draftKey: buildCaptureHandoffDraftKey(userId),
      userId,
      docType: "capture_handoff",
      documentId: CAPTURE_HANDOFF_DOCUMENT_ID,
      payload: parsedDraft,
    });
  } else {
    console.warn("Discarded malformed quote draft from sessionStorage migration.");
  }

  window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  return parsedDraft;
}

export async function readQuoteDraftFromIDB(userId: string): Promise<QuoteDraft | null> {
  const persistedRecord = await getLocalDraft<unknown>(buildCaptureHandoffDraftKey(userId), userId);
  if (persistedRecord) {
    const parsedDraft = parseDraftFromValue(persistedRecord.payload);
    if (!parsedDraft) {
      console.warn("Discarded malformed quote draft from IndexedDB.");
      return null;
    }
    return parsedDraft;
  }

  return migrateSessionStorageDraftIfPresent(userId);
}
