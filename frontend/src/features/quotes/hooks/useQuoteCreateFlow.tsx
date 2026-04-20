import { useState } from "react";

import { QuoteCreateEntrySheet } from "@/features/quotes/components/QuoteCreateEntrySheet";
import { QuoteReuseChooser } from "@/features/quotes/components/QuoteReuseChooser";

interface UseQuoteCreateFlowParams {
  customerId?: string;
  timezone?: string | null;
  entrySheetTitle?: string;
  entrySheetDescription?: string;
  onCreateNew: () => void;
  onQuoteDuplicated: (quoteId: string) => void;
}

interface QuoteCreateFlowController {
  openCreateEntry: () => void;
  dialogs: React.ReactElement;
}

export function useQuoteCreateFlow({
  customerId,
  timezone,
  entrySheetTitle,
  entrySheetDescription,
  onCreateNew,
  onQuoteDuplicated,
}: UseQuoteCreateFlowParams): QuoteCreateFlowController {
  const [isCreateEntryOpen, setIsCreateEntryOpen] = useState(false);
  const [isReuseChooserOpen, setIsReuseChooserOpen] = useState(false);

  function openCreateEntry(): void {
    setIsCreateEntryOpen(true);
  }

  function closeCreateEntry(): void {
    setIsCreateEntryOpen(false);
  }

  function closeReuseChooser(): void {
    setIsReuseChooserOpen(false);
  }

  function onCreateFromExisting(): void {
    setIsCreateEntryOpen(false);
    setIsReuseChooserOpen(true);
  }

  function onCreateNewSelected(): void {
    setIsCreateEntryOpen(false);
    onCreateNew();
  }

  function onQuoteDuplicatedSelected(quoteId: string): void {
    setIsReuseChooserOpen(false);
    onQuoteDuplicated(quoteId);
  }

  return {
    openCreateEntry,
    dialogs: (
      <>
        <QuoteCreateEntrySheet
          open={isCreateEntryOpen}
          title={entrySheetTitle}
          description={entrySheetDescription}
          onClose={closeCreateEntry}
          onCreateNew={onCreateNewSelected}
          onCreateFromExisting={onCreateFromExisting}
        />
        <QuoteReuseChooser
          open={isReuseChooserOpen}
          customerId={customerId}
          timezone={timezone}
          onClose={closeReuseChooser}
          onQuoteDuplicated={onQuoteDuplicatedSelected}
        />
      </>
    ),
  };
}
