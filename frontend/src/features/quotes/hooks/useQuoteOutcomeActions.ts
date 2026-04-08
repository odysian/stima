import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";

import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteDetail } from "@/features/quotes/types/quote.types";

interface UseQuoteOutcomeActionsArgs {
  quoteId: string | undefined;
  quote: QuoteDetail | null;
  refetchQuote: (quoteId: string) => Promise<void>;
  navigate: NavigateFunction;
  clearInvoiceError: () => void;
  clearShareFeedback: () => void;
}

interface UseQuoteOutcomeActionsResult {
  isMarkingWon: boolean;
  isMarkingLost: boolean;
  outcomeError: string | null;
  isDeleting: boolean;
  deleteError: string | null;
  showDeleteConfirm: boolean;
  showMarkWonConfirm: boolean;
  showMarkLostConfirm: boolean;
  setShowDeleteConfirm: Dispatch<SetStateAction<boolean>>;
  setShowMarkWonConfirm: Dispatch<SetStateAction<boolean>>;
  setShowMarkLostConfirm: Dispatch<SetStateAction<boolean>>;
  onConfirmMarkWon: () => Promise<void>;
  onConfirmMarkLost: () => Promise<void>;
  onDelete: () => Promise<void>;
}

export function useQuoteOutcomeActions({
  quoteId,
  quote,
  refetchQuote,
  navigate,
  clearInvoiceError,
  clearShareFeedback,
}: UseQuoteOutcomeActionsArgs): UseQuoteOutcomeActionsResult {
  const [isMarkingWon, setIsMarkingWon] = useState(false);
  const [isMarkingLost, setIsMarkingLost] = useState(false);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMarkWonConfirm, setShowMarkWonConfirm] = useState(false);
  const [showMarkLostConfirm, setShowMarkLostConfirm] = useState(false);

  async function onConfirmMarkWon(): Promise<void> {
    if (!quoteId || !quote) {
      return;
    }

    setOutcomeError(null);
    clearShareFeedback();
    clearInvoiceError();
    setShowMarkWonConfirm(false);
    setIsMarkingWon(true);
    try {
      await quoteService.markQuoteWon(quoteId);
      await refetchQuote(quoteId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to mark quote as won";
      setOutcomeError(message);
    } finally {
      setIsMarkingWon(false);
    }
  }

  async function onConfirmMarkLost(): Promise<void> {
    if (!quoteId || !quote) {
      return;
    }

    setOutcomeError(null);
    clearShareFeedback();
    clearInvoiceError();
    setShowMarkLostConfirm(false);
    setIsMarkingLost(true);
    try {
      await quoteService.markQuoteLost(quoteId);
      await refetchQuote(quoteId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to mark quote as lost";
      setOutcomeError(message);
    } finally {
      setIsMarkingLost(false);
    }
  }

  async function onDelete(): Promise<void> {
    if (!quoteId || !quote) {
      return;
    }

    setDeleteError(null);
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    try {
      await quoteService.deleteQuote(quoteId);
      navigate("/", { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete quote";
      setDeleteError(message);
    } finally {
      setIsDeleting(false);
    }
  }

  return {
    isMarkingWon,
    isMarkingLost,
    outcomeError,
    isDeleting,
    deleteError,
    showDeleteConfirm,
    showMarkWonConfirm,
    showMarkLostConfirm,
    setShowDeleteConfirm,
    setShowMarkWonConfirm,
    setShowMarkLostConfirm,
    onConfirmMarkWon,
    onConfirmMarkLost,
    onDelete,
  };
}
