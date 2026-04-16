import type { ExtractionReviewHiddenDetails, HiddenItemState } from "@/features/quotes/types/quote.types";

export interface CaptureDetailsActionableItem {
  id: string;
  kind: "append_suggestion" | "unresolved_segment";
  field: "notes" | "explicit_total" | "deposit_amount" | "tax_rate" | "discount" | null;
  reason: string | null;
  text: string;
}

export function resolveCaptureDetailsActionableItems(
  hiddenDetails?: ExtractionReviewHiddenDetails,
): CaptureDetailsActionableItem[] {
  if (!hiddenDetails) {
    return [];
  }

  return hiddenDetails.items.map((item) => ({
    id: item.id,
    kind: item.kind,
    field: item.field ?? null,
    reason: item.reason ?? null,
    text: item.text,
  }));
}

export function hasUndismissedCaptureDetailsItems(
  items: CaptureDetailsActionableItem[],
  hiddenDetailState?: Record<string, HiddenItemState>,
): boolean {
  return items.some((item) => !hiddenDetailState?.[item.id]?.dismissed);
}

export function buildCaptureDetailsFingerprint(items: CaptureDetailsActionableItem[]): string {
  const ids = Array.from(new Set(items.map((item) => item.id))).sort();
  return ids.join("|");
}
