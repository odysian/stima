import { normalizeLineItem } from "@/features/quotes/components/reviewScreenUtils";
import type { LineItemDraft } from "@/features/quotes/types/quote.types";

import { HOME_ROUTE } from "@/features/quotes/utils/workflowNavigation";

export interface ReviewLocationState {
  origin?: "preview" | "list" | "home";
  returnTo?: string;
  notice?: string;
  reseedDraft?: boolean;
}

export interface DraftSnapshot {
  docType: "quote" | "invoice";
  title: string;
  transcript: string;
  lineItems: LineItemDraft[];
  total: number | null;
  taxRate: number | null;
  discountType: "fixed" | "percent" | null;
  discountValue: number | null;
  depositAmount: number | null;
  notes: string;
  dueDate: string;
}

export function buildDraftSnapshot(
  draft: {
    docType?: "quote" | "invoice";
    title: string;
    transcript?: string;
    lineItems: {
      description: string;
      details: string | null;
      price: number | null;
      priceStatus?: "priced" | "included" | "unknown";
    }[];
    total: number | null;
    taxRate: number | null;
    discountType: "fixed" | "percent" | null;
    discountValue: number | null;
    depositAmount: number | null;
    notes: string;
    dueDate?: string;
  },
): DraftSnapshot {
  const normalizedLineItems = draft.lineItems
    .map(normalizeLineItem)
    .filter((lineItem) =>
      lineItem.description.length > 0
      || lineItem.details !== null
      || lineItem.price !== null
    )
    .map((lineItem) => ({
      description: lineItem.description,
      details: lineItem.details,
      price: lineItem.price,
      price_status: lineItem.priceStatus,
    }));

  return {
    docType: draft.docType === "invoice" ? "invoice" : "quote",
    title: draft.title,
    transcript: draft.transcript ?? "",
    lineItems: normalizedLineItems,
    total: draft.total,
    taxRate: draft.taxRate,
    discountType: draft.discountType,
    discountValue: draft.discountValue,
    depositAmount: draft.depositAmount,
    notes: draft.notes,
    dueDate: draft.dueDate ?? "",
  };
}

export function readReviewLocationState(value: unknown): ReviewLocationState {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  const state = value as {
    origin?: unknown;
    returnTo?: unknown;
    notice?: unknown;
    reseedDraft?: unknown;
  };

  return {
    origin: state.origin === "preview" || state.origin === "list" || state.origin === "home"
      ? state.origin
      : undefined,
    returnTo: typeof state.returnTo === "string" ? state.returnTo : undefined,
    notice: typeof state.notice === "string" ? state.notice : undefined,
    reseedDraft: state.reseedDraft === true,
  };
}

export function resolveBackTarget(state: ReviewLocationState, quoteId: string | undefined): string {
  if (state.origin === "preview" && quoteId) {
    return `/quotes/${quoteId}/preview`;
  }

  if (typeof state.returnTo === "string" && state.returnTo.length > 0) {
    return state.returnTo;
  }

  return HOME_ROUTE;
}
