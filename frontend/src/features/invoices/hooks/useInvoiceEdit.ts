import { useCallback, useState } from "react";

import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { resolveLineItemSum, type DiscountType } from "@/shared/lib/pricing";

const EDIT_STORAGE_KEY = "stima_invoice_edit";

export interface InvoiceEditDraft {
  invoiceId: string;
  title: string;
  lineItems: LineItemDraftWithFlags[];
  total: number | null;
  taxRate: number | null;
  discountType: DiscountType | null;
  discountValue: number | null;
  depositAmount: number | null;
  notes: string;
  dueDate: string;
}

interface UseInvoiceEditResult {
  draft: InvoiceEditDraft | null;
  setDraft: (nextDraft: InvoiceEditDraft) => void;
  updateLineItem: (index: number, item: LineItemDraftWithFlags) => void;
  removeLineItem: (index: number) => void;
  clearDraft: () => void;
}

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

function parseStoredDraft(raw: string | null): InvoiceEditDraft | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) {
      return null;
    }

    const {
      invoiceId,
      title,
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
      typeof invoiceId !== "string"
      || (title !== undefined && typeof title !== "string")
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
      invoiceId,
      title: typeof title === "string" ? title : "",
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

function readDraftFromStorage(): InvoiceEditDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  return parseStoredDraft(window.sessionStorage.getItem(EDIT_STORAGE_KEY));
}

function persistDraftToStorage(draft: InvoiceEditDraft): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(EDIT_STORAGE_KEY, JSON.stringify(draft));
}

function removeDraftFromStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(EDIT_STORAGE_KEY);
}

export function useInvoiceEdit(): UseInvoiceEditResult {
  const [draft, setDraftState] = useState<InvoiceEditDraft | null>(() => readDraftFromStorage());

  const setDraft = useCallback((nextDraft: InvoiceEditDraft) => {
    persistDraftToStorage(nextDraft);
    setDraftState(nextDraft);
  }, []);

  const clearDraft = useCallback(() => {
    removeDraftFromStorage();
    setDraftState(null);
  }, []);

  const updateLineItem = useCallback((index: number, item: LineItemDraftWithFlags) => {
    setDraftState((currentDraft) => {
      if (!currentDraft || index < 0 || index >= currentDraft.lineItems.length) {
        return currentDraft;
      }

      const nextDraft: InvoiceEditDraft = {
        ...currentDraft,
        lineItems: currentDraft.lineItems.map((existingItem, currentIndex) =>
          currentIndex === index ? item : existingItem,
        ),
        total: syncDraftTotalWithLineItems(
          currentDraft,
          currentDraft.lineItems.map((existingItem, currentIndex) =>
            currentIndex === index ? item : existingItem,
          ),
        ),
      };
      persistDraftToStorage(nextDraft);
      return nextDraft;
    });
  }, []);

  const removeLineItem = useCallback((index: number) => {
    setDraftState((currentDraft) => {
      if (!currentDraft || index < 0 || index >= currentDraft.lineItems.length) {
        return currentDraft;
      }

      const nextDraft: InvoiceEditDraft = {
        ...currentDraft,
        lineItems: currentDraft.lineItems.filter((_, currentIndex) => currentIndex !== index),
        total: syncDraftTotalWithLineItems(
          currentDraft,
          currentDraft.lineItems.filter((_, currentIndex) => currentIndex !== index),
        ),
      };
      persistDraftToStorage(nextDraft);
      return nextDraft;
    });
  }, []);

  return {
    draft,
    setDraft,
    updateLineItem,
    removeLineItem,
    clearDraft,
  };
}


function syncDraftTotalWithLineItems(
  currentDraft: InvoiceEditDraft,
  nextLineItems: LineItemDraftWithFlags[],
): number | null {
  const currentDerivedSubtotal = resolveFullyPricedLineItemSum(currentDraft.lineItems);
  if (currentDerivedSubtotal !== currentDraft.total) {
    return currentDraft.total;
  }

  const nextDerivedSubtotal = resolveFullyPricedLineItemSum(nextLineItems);
  if (nextDerivedSubtotal === null) {
    return hasSubstantiveLineItems(nextLineItems) ? currentDraft.total : null;
  }
  return nextDerivedSubtotal;
}


function resolveFullyPricedLineItemSum(lineItems: LineItemDraftWithFlags[]): number | null {
  const substantiveLineItems = lineItems.filter(hasLineItemContent);
  if (substantiveLineItems.length === 0) {
    return null;
  }
  if (substantiveLineItems.some((lineItem) => lineItem.price === null)) {
    return null;
  }
  return resolveLineItemSum(substantiveLineItems.map((lineItem) => lineItem.price));
}


function hasSubstantiveLineItems(lineItems: LineItemDraftWithFlags[]): boolean {
  return lineItems.some(hasLineItemContent);
}


function hasLineItemContent(lineItem: LineItemDraftWithFlags): boolean {
  return (
    lineItem.description.trim().length > 0
    || (lineItem.details?.trim().length ?? 0) > 0
    || lineItem.price !== null
  );
}
