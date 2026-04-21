import type { ExtractionReviewHiddenDetails, HiddenItemState } from "@/features/quotes/types/quote.types";

const PRICING_FIELDS = new Set(["explicit_total", "deposit_amount", "tax_rate", "discount"] as const);
const TRUE_OVERFLOW_REASON = "leftover_classification";

type CaptureDetailsDisplayBucket =
  | "unplaced_capture_detail"
  | "unresolved_note"
  | "unresolved_pricing_detail";

const DISPLAY_BUCKET_LABELS: Record<CaptureDetailsDisplayBucket, string> = {
  unplaced_capture_detail: "Unplaced capture detail",
  unresolved_note: "Unresolved note",
  unresolved_pricing_detail: "Unresolved pricing detail",
};

export interface CaptureDetailsActionableItem {
  id: string;
  kind: "unresolved_segment";
  field: "notes" | "explicit_total" | "deposit_amount" | "tax_rate" | "discount" | null;
  label: string;
  text: string;
}

function resolveDisplayBucket(item: {
  field: "notes" | "explicit_total" | "deposit_amount" | "tax_rate" | "discount" | null;
  reason: string | null;
}): CaptureDetailsDisplayBucket | null {
  // "True overflow" items come from leftover classification; other reasons are transcript/model conflicts.
  if (item.reason !== null && item.reason !== TRUE_OVERFLOW_REASON) {
    return null;
  }

  if (item.field === "notes") {
    return "unresolved_note";
  }

  if (item.field !== null && PRICING_FIELDS.has(item.field)) {
    return "unresolved_pricing_detail";
  }

  return "unplaced_capture_detail";
}

export function resolveCaptureDetailsActionableItems(
  hiddenDetails?: ExtractionReviewHiddenDetails,
): CaptureDetailsActionableItem[] {
  if (!hiddenDetails) {
    return [];
  }

  return hiddenDetails.items.flatMap((item) => {
    const normalizedItem = {
      id: item.id,
      kind: item.kind,
      field: item.field ?? null,
      reason: item.reason ?? null,
      text: item.text,
    } as const;
    const displayBucket = resolveDisplayBucket(normalizedItem);
    if (!displayBucket) {
      return [];
    }

    return [{
      id: normalizedItem.id,
      kind: normalizedItem.kind,
      field: normalizedItem.field,
      label: DISPLAY_BUCKET_LABELS[displayBucket],
      text: normalizedItem.text,
    }];
  });
}

export function hasUndismissedCaptureDetailsItems(
  items: CaptureDetailsActionableItem[],
  hiddenDetailState?: Record<string, HiddenItemState>,
): boolean {
  return items.some((item) => !hiddenDetailState?.[item.id]?.dismissed);
}
