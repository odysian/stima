import { useCallback, useState } from "react";

import { quoteService } from "@/features/quotes/services/quoteService";
import type { ExtractionReviewMetadataUpdateRequest } from "@/features/quotes/types/quote.types";

interface UseHiddenDetailLifecycleParams {
  canMutate: boolean;
  documentId: string;
  refreshDocument: () => Promise<unknown>;
  setSaveError: (message: string | null) => void;
}

interface HiddenDetailLifecycleActions {
  isMutatingHiddenItems: boolean;
  dismissHiddenItem: (itemId: string) => Promise<void>;
}

export function useHiddenDetailLifecycle({
  canMutate,
  documentId,
  refreshDocument,
  setSaveError,
}: UseHiddenDetailLifecycleParams): HiddenDetailLifecycleActions {
  const [isMutatingHiddenItems, setIsMutatingHiddenItems] = useState(false);

  const mutateExtractionReviewMetadata = useCallback(
    async (payload: ExtractionReviewMetadataUpdateRequest): Promise<void> => {
      if (!canMutate || !documentId) {
        return;
      }

      setIsMutatingHiddenItems(true);
      setSaveError(null);
      try {
        await quoteService.updateExtractionReviewMetadata(documentId, payload);
        await refreshDocument();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to update capture details";
        setSaveError(message);
      } finally {
        setIsMutatingHiddenItems(false);
      }
    },
    [canMutate, documentId, refreshDocument, setSaveError],
  );

  const dismissHiddenItem = useCallback(
    async (itemId: string): Promise<void> => {
      await mutateExtractionReviewMetadata({ dismiss_hidden_item: itemId });
    },
    [mutateExtractionReviewMetadata],
  );

  return {
    isMutatingHiddenItems,
    dismissHiddenItem,
  };
}
