import { buildDraftFromQuoteDetail } from "@/features/quotes/components/captureScreenDraft";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteSourceType } from "@/features/quotes/types/quote.types";
import { perfMark, perfMeasure } from "@/shared/perf";

interface HydrateDraftParams {
  quoteId: string;
  sourceType: QuoteSourceType;
  customerId: string | undefined;
  launchOrigin: string;
  setDraft: (draft: ReturnType<typeof buildDraftFromQuoteDetail>) => void;
}

export async function hydrateCaptureDraftFromQuote({
  quoteId,
  sourceType,
  customerId,
  launchOrigin,
  setDraft,
}: HydrateDraftParams): Promise<void> {
  perfMark("capture:draft:hydrate_start");
  const persistedQuote = await quoteService.getQuote(quoteId);
  setDraft(buildDraftFromQuoteDetail({
    sourceType,
    quoteDetail: persistedQuote,
    quoteId,
    customerId,
    launchOrigin,
  }));
  perfMark("capture:draft:ready");
  perfMeasure("capture:draft:hydrate_ms", "capture:draft:hydrate_start", "capture:draft:ready");
}
