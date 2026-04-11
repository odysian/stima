import { useCallback, useEffect, useState } from "react";

import { invoiceService } from "@/features/invoices/services/invoiceService";
import { isInvoiceEditableStatus } from "@/features/invoices/utils/invoiceStatus";
import { quoteService } from "@/features/quotes/services/quoteService";
import { isQuoteEditableStatus } from "@/features/quotes/utils/quoteStatus";
import { isHttpRequestError } from "@/shared/lib/http";
import {
  clearDocumentDraftFromStorage,
  mapDocumentToEditDraft,
  mapInvoiceToEditDraft,
  mapQuoteToEditDraft,
  persistDocumentDraftToStorage,
  readDocumentDraftFromStorage,
  type DocumentEditDraft,
  type PersistedEditableDocument,
} from "@/features/quotes/hooks/persistedDocumentDraft";

export {
  mapInvoiceToEditDraft,
  mapQuoteToEditDraft,
  type DocumentEditDraft,
  type PersistedEditableDocument,
};

async function fetchEditableDocument(documentId: string): Promise<PersistedEditableDocument> {
  try {
    const quote = await quoteService.getQuote(documentId);
    if (!isQuoteEditableStatus(quote.status)) {
      throw new Error("This quote can no longer be edited.");
    }
    return quote;
  } catch (quoteError) {
    if (quoteError instanceof Error && quoteError.message === "This quote can no longer be edited.") {
      throw quoteError;
    }

    if (!isHttpRequestError(quoteError) || quoteError.status !== 404) {
      throw quoteError;
    }

    const invoice = await invoiceService.getInvoice(documentId);
    if (!isInvoiceEditableStatus(invoice.status)) {
      throw new Error("This invoice can no longer be edited.");
    }
    return invoice;
  }
}

interface UsePersistedReviewResult {
  document: PersistedEditableDocument | null;
  draft: DocumentEditDraft | null;
  setDraft: (nextDraft: DocumentEditDraft | ((current: DocumentEditDraft) => DocumentEditDraft)) => void;
  clearDraft: () => void;
  isLoadingDocument: boolean;
  loadError: string | null;
  refreshDocument: (options?: { reseedDraft?: boolean }) => Promise<PersistedEditableDocument>;
}

export function usePersistedReview(documentId: string | undefined): UsePersistedReviewResult {
  const [draft, setDraftState] = useState<DocumentEditDraft | null>(() => readDocumentDraftFromStorage());
  const [document, setDocument] = useState<PersistedEditableDocument | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const setDraft = useCallback((
    nextDraft: DocumentEditDraft | ((current: DocumentEditDraft) => DocumentEditDraft),
  ) => {
    setDraftState((currentDraft) => {
      const resolvedDraft =
        typeof nextDraft === "function"
          ? (currentDraft ? nextDraft(currentDraft) : currentDraft)
          : nextDraft;

      if (!resolvedDraft) {
        return currentDraft;
      }

      persistDocumentDraftToStorage(resolvedDraft);
      return resolvedDraft;
    });
  }, []);

  const clearDraft = useCallback(() => {
    clearDocumentDraftFromStorage();
    setDraftState(null);
  }, []);

  const refreshDocument = useCallback(async (
    options?: { reseedDraft?: boolean },
  ): Promise<PersistedEditableDocument> => {
    if (!documentId) {
      throw new Error("Missing document id.");
    }

    const refreshedDocument = await fetchEditableDocument(documentId);
    setDocument(refreshedDocument);
    if (options?.reseedDraft) {
      setDraft(mapDocumentToEditDraft(refreshedDocument));
    }
    return refreshedDocument;
  }, [documentId, setDraft]);

  useEffect(() => {
    let isActive = true;

    async function fetchDocument(): Promise<void> {
      if (!documentId) {
        setLoadError("Missing document id.");
        setIsLoadingDocument(false);
        return;
      }

      setIsLoadingDocument(true);
      setLoadError(null);

      try {
        const fetchedDocument = await fetchEditableDocument(documentId);
        if (!isActive) {
          return;
        }

        setDocument(fetchedDocument);
      } catch (error) {
        if (!isActive) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unable to load document";
        setLoadError(message);
      } finally {
        if (isActive) {
          setIsLoadingDocument(false);
        }
      }
    }

    void fetchDocument();

    return () => {
      isActive = false;
    };
  }, [documentId]);

  useEffect(() => {
    if (!document) {
      return;
    }

    if (!draft || draft.documentId !== document.id) {
      setDraft(mapDocumentToEditDraft(document));
    }
  }, [document, draft, setDraft]);

  const currentDraft = draft && document && draft.documentId === document.id ? draft : null;

  return {
    document,
    draft: currentDraft,
    setDraft,
    clearDraft,
    isLoadingDocument,
    loadError,
    refreshDocument,
  };
}
