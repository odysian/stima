import { useState } from "react";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import { buildBulkActionFeedback } from "@/features/quotes/components/quoteListBulkActionFeedback";
import { quoteService } from "@/features/quotes/services/quoteService";
import type {
  BulkActionResponse,
  BulkActionType,
} from "@/features/quotes/types/quote.types";
import { isHttpRequestError } from "@/shared/lib/http";

type DocumentMode = "quotes" | "invoices";

export interface BulkActionFeedbackState {
  kind: "success" | "warn";
  title: string;
  message: string;
}

interface UseDocumentBulkActionsArgs {
  documentMode: DocumentMode;
  selectedIds: string[];
  onComplete: () => void;
}

interface UseDocumentBulkActionsResult {
  bulkActionError: string | null;
  bulkActionFeedback: BulkActionFeedbackState | null;
  isBulkActionPending: boolean;
  showArchiveConfirm: boolean;
  showDeleteConfirm: boolean;
  openArchiveConfirm: () => void;
  openDeleteConfirm: () => void;
  closeArchiveConfirm: () => void;
  closeDeleteConfirm: () => void;
  closeSelectionActionDialogs: () => void;
  clearBulkActionFeedback: () => void;
  executeBulkAction: (action: BulkActionType) => Promise<void>;
}

export function useDocumentBulkActions({
  documentMode,
  selectedIds,
  onComplete,
}: UseDocumentBulkActionsArgs): UseDocumentBulkActionsResult {
  const [bulkActionError, setBulkActionError] = useState<string | null>(null);
  const [bulkActionFeedback, setBulkActionFeedback] = useState<BulkActionFeedbackState | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isBulkActionPending, setIsBulkActionPending] = useState(false);

  function closeSelectionActionDialogs(): void {
    setShowArchiveConfirm(false);
    setShowDeleteConfirm(false);
  }

  function resolveBulkActionErrorMessage(error: unknown): string {
    if (isHttpRequestError(error)) {
      if (error.status === 422) {
        return "Unable to run that bulk action. Please refresh and try again.";
      }
      return error.message || "Unable to complete the selected action.";
    }
    if (error instanceof Error) {
      return error.message;
    }
    return "Unable to complete the selected action.";
  }

  async function executeBulkAction(action: BulkActionType): Promise<void> {
    if (selectedIds.length === 0 || isBulkActionPending) {
      return;
    }

    setBulkActionError(null);
    setBulkActionFeedback(null);
    setIsBulkActionPending(true);

    try {
      const response: BulkActionResponse = documentMode === "quotes"
        ? await quoteService.bulkAction({ action, ids: selectedIds })
        : await invoiceService.bulkAction({ action, ids: selectedIds });

      setBulkActionFeedback(buildBulkActionFeedback(response));
      closeSelectionActionDialogs();
      onComplete();
    } catch (error) {
      setBulkActionError(resolveBulkActionErrorMessage(error));
    } finally {
      setIsBulkActionPending(false);
    }
  }

  return {
    bulkActionError,
    bulkActionFeedback,
    isBulkActionPending,
    showArchiveConfirm,
    showDeleteConfirm,
    openArchiveConfirm: () => {
      setBulkActionError(null);
      setShowArchiveConfirm(true);
    },
    openDeleteConfirm: () => {
      setBulkActionError(null);
      setShowDeleteConfirm(true);
    },
    closeArchiveConfirm: () => setShowArchiveConfirm(false),
    closeDeleteConfirm: () => setShowDeleteConfirm(false),
    closeSelectionActionDialogs,
    clearBulkActionFeedback: () => setBulkActionFeedback(null),
    executeBulkAction,
  };
}
