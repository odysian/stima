import type { ExtractionReviewHiddenDetails, HiddenItemState } from "@/features/quotes/types/quote.types";

export interface CaptureDetailsActionableItem {
  id: string;
  kind: "append_suggestion" | "unresolved_segment" | "confidence_note";
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

  if (Array.isArray(hiddenDetails.items) && hiddenDetails.items.length > 0) {
    return hiddenDetails.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      field: item.field ?? null,
      reason: item.reason ?? null,
      text: item.text,
    }));
  }

  const appendSuggestions = hiddenDetails.append_suggestions ?? [];
  const unresolvedSegments = hiddenDetails.unresolved_segments ?? [];
  const confidenceNotes = hiddenDetails.confidence_notes ?? [];

  return [
    ...appendSuggestions.map((suggestion) => ({
      id: suggestion.id,
      kind: "append_suggestion" as const,
      field: (suggestion.pricing_field ?? "notes") as CaptureDetailsActionableItem["field"],
      reason: suggestion.source,
      text: suggestion.raw_text,
    })),
    ...unresolvedSegments.map((segment) => ({
      id: segment.id,
      kind: "unresolved_segment" as const,
      field: null,
      reason: segment.source,
      text: segment.raw_text,
    })),
    ...confidenceNotes.map((note, index) => ({
      id: `legacy-confidence-${index}`,
      kind: "confidence_note" as const,
      field: null,
      reason: "legacy_confidence_note",
      text: note,
    })),
  ];
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
