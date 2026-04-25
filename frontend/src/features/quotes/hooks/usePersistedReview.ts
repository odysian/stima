import { useCallback, useEffect, useRef, useState } from "react";

import { invoiceService } from "@/features/invoices/services/invoiceService";
import { isInvoiceEditableStatus } from "@/features/invoices/utils/invoiceStatus";
import { quoteService } from "@/features/quotes/services/quoteService";
import { isQuoteEditableStatus } from "@/features/quotes/utils/quoteStatus";
import { isHttpRequestError } from "@/shared/lib/http";
import {
  clearDocumentDraftFromIDB,
  mapDocumentToEditDraft,
  mapInvoiceToEditDraft,
  mapQuoteToEditDraft,
  persistDocumentDraftToIDB,
  readDocumentDraftFromIDB,
  type DocumentEditDraft,
  type PersistedEditableDocument,
} from "@/features/quotes/hooks/persistedDocumentDraft";

export {
  mapInvoiceToEditDraft,
  mapQuoteToEditDraft,
  type DocumentEditDraft,
  type PersistedEditableDocument,
};

const DOCUMENT_DRAFT_PERSIST_DEBOUNCE_MS = 250;

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

export function usePersistedReview(
  documentId: string | undefined,
  userId: string | undefined,
): UsePersistedReviewResult {
  const [draft, setDraftState] = useState<DocumentEditDraft | null>(null);
  const [document, setDocument] = useState<PersistedEditableDocument | null>(null);
  const [isLoadingDocumentState, setIsLoadingDocumentState] = useState(true);
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const persistTimerRef = useRef<number | null>(null);

  const scheduleDraftPersist = useCallback((nextDraft: DocumentEditDraft) => {
    if (!userId || typeof window === "undefined") {
      return;
    }

    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      void persistDocumentDraftToIDB(nextDraft, userId).catch((error) => {
        console.warn("Unable to persist document edit draft locally.", error);
      });
    }, DOCUMENT_DRAFT_PERSIST_DEBOUNCE_MS);
  }, [userId]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (persistTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
  }, [userId]);

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

      scheduleDraftPersist(resolvedDraft);
      return resolvedDraft;
    });
  }, [scheduleDraftPersist]);

  const clearDraft = useCallback(() => {
    setDraftState((currentDraft) => {
      if (currentDraft) {
        void clearDocumentDraftFromIDB(currentDraft.documentId, currentDraft.docType).catch((error) => {
          console.warn("Unable to clear document edit draft.", error);
        });
      }
      return null;
    });
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
        setDraftState(null);
        setIsLoadingDraft(false);
        setIsLoadingDocumentState(false);
        return;
      }

      setIsLoadingDocumentState(true);
      setIsLoadingDraft(true);
      setLoadError(null);

      try {
        const fetchedDocument = await fetchEditableDocument(documentId);
        if (!isActive) {
          return;
        }

        setDocument(fetchedDocument);
        if (!userId) {
          setDraftState(mapDocumentToEditDraft(fetchedDocument));
          return;
        }

        const docType = "customer" in fetchedDocument ? "invoice" : "quote";
        const hydratedDraft = await readDocumentDraftFromIDB(fetchedDocument.id, docType, userId);
        if (!isActive) {
          return;
        }

        setDraftState(hydratedDraft ?? mapDocumentToEditDraft(fetchedDocument));
      } catch (error) {
        if (!isActive) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unable to load document";
        setLoadError(message);
      } finally {
        if (isActive) {
          setIsLoadingDocumentState(false);
          setIsLoadingDraft(false);
        }
      }
    }

    void fetchDocument();

    return () => {
      isActive = false;
    };
  }, [documentId, userId]);

  const currentDraft = draft && document && draft.documentId === document.id ? draft : null;
  const isLoadingDocument = isLoadingDocumentState || isLoadingDraft;

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
