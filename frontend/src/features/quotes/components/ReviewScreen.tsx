import { useEffect, useMemo, useRef, useState } from "react";
import { useBeforeUnload, useLocation, useNavigate, useParams } from "react-router-dom";

import { profileService } from "@/features/profile/services/profileService";
import { ReviewActionFooter } from "@/features/quotes/components/ReviewActionFooter";
import { ReviewCustomerAssignmentSheet } from "@/features/quotes/components/ReviewCustomerAssignmentSheet";
import { ReviewFormContent } from "@/features/quotes/components/ReviewFormContent";
import { LineItemEditSheet } from "@/features/quotes/components/LineItemEditSheet";
import { applyLineItemSheetDelete, applyLineItemSheetSave, resolveLineItemSheetInitialItem, type ReviewLineItemSheetState } from "@/features/quotes/components/reviewLineItemSheetState";
import { buildReviewUpdatePayload } from "@/features/quotes/components/reviewUpdatePayload";
import { EMPTY_LINE_ITEM, isInvalidLineItem, normalizeLineItem } from "@/features/quotes/components/reviewScreenUtils";
import { mapQuoteToEditDraft, usePersistedReview } from "@/features/quotes/hooks/usePersistedReview";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { LineItemDraft, QuoteDetail } from "@/features/quotes/types/quote.types";
import { HOME_ROUTE } from "@/features/quotes/utils/workflowNavigation";
import { buildDraftSnapshot, readReviewLocationState, resolveBackTarget } from "@/features/quotes/utils/reviewScreenState";
import { readQuoteConfidenceNotes, writeQuoteConfidenceNotes } from "@/features/quotes/utils/reviewConfidenceNotes";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Toast } from "@/shared/components/Toast";
import { DOCUMENT_LINE_ITEMS_MAX_ITEMS } from "@/shared/lib/inputLimits";
import { WorkflowScreenHeader } from "@/shared/components/WorkflowScreenHeader";

function buildQuoteSnapshotKey(quote: QuoteDetail): string {
  const canonicalDraft = mapQuoteToEditDraft(quote);
  return JSON.stringify(buildDraftSnapshot(canonicalDraft));
}

export function ReviewScreen(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const {
    quote,
    draft,
    setDraft,
    clearDraft,
    isLoadingQuote,
    loadError,
    refreshQuote,
  } = usePersistedReview(id);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [submitAction, setSubmitAction] = useState<"save" | "continue" | null>(null);
  const [isAssignmentSheetOpen, setIsAssignmentSheetOpen] = useState(false);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [pendingNavigationTarget, setPendingNavigationTarget] = useState<{
    to: string;
    replace?: boolean;
  } | null>(null);
  const [savedSnapshotKey, setSavedSnapshotKey] = useState<string | null>(null);
  const [snapshotQuoteId, setSnapshotQuoteId] = useState<string | null>(null);
  const [suggestedTaxRate, setSuggestedTaxRate] = useState<number | null>(null);
  const [isAssigningCustomer, setIsAssigningCustomer] = useState(false);
  const [confidenceNotes, setConfidenceNotes] = useState<string[]>([]);
  const [hasAppliedReseedFromLocation, setHasAppliedReseedFromLocation] = useState(false);
  const [lineItemSheetState, setLineItemSheetState] = useState<ReviewLineItemSheetState | null>(null);
  const isAddVoiceNoteInFlightRef = useRef(false);
  const locationState = useMemo(() => readReviewLocationState(location.state), [location.state]);
  const requiresCustomerAssignment = useMemo(() => {
    if (!quote) {
      return false;
    }
    if (typeof quote.requires_customer_assignment === "boolean") {
      return quote.requires_customer_assignment;
    }
    return quote.customer_id === null;
  }, [quote]);

  const canReassignCustomer = useMemo(() => {
    if (!quote) {
      return false;
    }
    if (typeof quote.can_reassign_customer === "boolean") {
      return quote.can_reassign_customer;
    }
    return (quote.status === "draft" || quote.status === "ready") && !quote.linked_invoice;
  }, [quote]);

  const hasVisibleConfidenceNotes = confidenceNotes.length > 0;

  const currentSnapshotKey = useMemo(() => {
    if (!draft) {
      return null;
    }
    return JSON.stringify(buildDraftSnapshot(draft));
  }, [draft]);

  useEffect(() => {
    if (!id) {
      return;
    }
    setConfidenceNotes(readQuoteConfidenceNotes(id));
    setHasAppliedReseedFromLocation(false);
  }, [id]);

  useEffect(() => {
    if (!id || !locationState.reseedDraft || hasAppliedReseedFromLocation) {
      return;
    }

    setHasAppliedReseedFromLocation(true);
    void refreshQuote({ reseedDraft: true }).catch(() => {
      // Existing load/save error messaging covers failed refreshes.
    });
  }, [hasAppliedReseedFromLocation, id, locationState.reseedDraft, refreshQuote]);

  useEffect(() => {
    if (!quote || !draft || !currentSnapshotKey) {
      return;
    }
    if (snapshotQuoteId !== quote.id) {
      setSnapshotQuoteId(quote.id);
      setSavedSnapshotKey(currentSnapshotKey);
    }
  }, [currentSnapshotKey, draft, quote, snapshotQuoteId]);

  useEffect(() => {
    let isActive = true;
    async function loadSuggestedTaxRate(): Promise<void> {
      try {
        const profile = await profileService.getProfile();
        if (isActive) {
          setSuggestedTaxRate(profile.default_tax_rate);
        }
      } catch {
        if (isActive) {
          setSuggestedTaxRate(null);
        }
      }
    }
    void loadSuggestedTaxRate();
    return () => {
      isActive = false;
    };
  }, []);

  const hasUnsavedChanges = currentSnapshotKey !== null
    && savedSnapshotKey !== null
    && currentSnapshotKey !== savedSnapshotKey;

  useBeforeUnload((event) => {
    if (!hasUnsavedChanges) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  });

  function requestNavigation(target: { to: string; replace?: boolean }): void {
    if (!hasUnsavedChanges) {
      navigate(target.to, { replace: target.replace });
      return;
    }

    setPendingNavigationTarget(target);
    setShowLeaveWarning(true);
  }

  function handleLeaveConfirm(): void {
    setShowLeaveWarning(false);

    if (pendingNavigationTarget) {
      const nextTarget = pendingNavigationTarget;
      setPendingNavigationTarget(null);
      clearDraft();
      navigate(nextTarget.to, { replace: nextTarget.replace });
    }
  }

  function handleLeaveCancel(): void {
    setShowLeaveWarning(false);
    setPendingNavigationTarget(null);
  }

  if (!id) {
    return (
      <main className="min-h-screen bg-background px-4 pt-20">
        <FeedbackMessage variant="error">Missing quote id.</FeedbackMessage>
      </main>
    );
  }

  const quoteId = id;
  const shouldUseQuoteListBackTarget = locationState.origin === "preview" && requiresCustomerAssignment;
  const backTarget = shouldUseQuoteListBackTarget
    ? HOME_ROUTE
    : resolveBackTarget(locationState, quoteId);
  const backLabel = shouldUseQuoteListBackTarget
    ? "Back to quotes"
    : (locationState.origin === "preview" ? "Back to preview" : "Back to quotes");

  if (isLoadingQuote || !draft) {
    return (
      <main className="min-h-screen bg-background px-4 pt-20">
        {isLoadingQuote ? (
          <p role="status" className="text-sm text-on-surface-variant">Loading quote...</p>
        ) : null}
        {loadError ? <FeedbackMessage variant="error">{loadError}</FeedbackMessage> : null}
      </main>
    );
  }
  if (!quote) {
    return (
      <main className="min-h-screen bg-background px-4 pt-20">
        <FeedbackMessage variant="error">{loadError ?? "Unable to load quote."}</FeedbackMessage>
      </main>
    );
  }
  const activeDraft = draft;

  const normalizedLineItems = activeDraft.lineItems.map(normalizeLineItem);
  const hasInvalidLineItems = normalizedLineItems.some(isInvalidLineItem);
  const lineItemsForSubmit: LineItemDraft[] = normalizedLineItems
    .filter((lineItem) => lineItem.description.length > 0)
    .map((lineItem) => ({
      description: lineItem.description,
      details: lineItem.details,
      price: lineItem.price,
    }));
  const lineItemSum = normalizedLineItems.reduce((runningTotal, lineItem) => {
    if (lineItem.price === null) {
      return runningTotal;
    }
    return runningTotal + lineItem.price;
  }, 0);

  const isInteractionLocked = submitAction !== null || isAssigningCustomer;
  const lineItemSheetInitialItem = lineItemSheetState
    ? resolveLineItemSheetInitialItem(activeDraft, lineItemSheetState, EMPTY_LINE_ITEM)
    : EMPTY_LINE_ITEM;

  async function tryAutoSaveDraft(): Promise<void> {
    const { payload } = buildReviewUpdatePayload({
      draft: activeDraft,
      lineItemsForSubmit,
      hasInvalidLineItems,
    });
    if (!payload) {
      return;
    }

    try {
      await quoteService.updateQuote(quoteId, payload);
    } catch {
      // Best-effort autosave should never block append-capture navigation.
    }
  }

  async function handleAddVoiceNote(): Promise<void> {
    if (isAddVoiceNoteInFlightRef.current) {
      return;
    }

    isAddVoiceNoteInFlightRef.current = true;

    try {
      await tryAutoSaveDraft();
      navigate(`/quotes/${quoteId}/review/append-capture`, {
        state: { launchOrigin: `/quotes/${quoteId}/review` },
      });
    } finally {
      isAddVoiceNoteInFlightRef.current = false;
    }
  }

  async function saveDraft(nextAction: "save" | "continue"): Promise<void> {
    setSaveError(null);
    setToastMessage(null);

    const { payload, validationMessage } = buildReviewUpdatePayload({
      draft: activeDraft,
      lineItemsForSubmit,
      hasInvalidLineItems,
    });
    if (!payload) {
      setSaveError(validationMessage ?? "Unable to save quote.");
      return;
    }

    setSubmitAction(nextAction);

    try {
      await quoteService.updateQuote(quoteId, payload);
      const refreshedQuote = await refreshQuote({ reseedDraft: true });
      setSavedSnapshotKey(buildQuoteSnapshotKey(refreshedQuote));

      if (nextAction === "continue") {
        navigate(`/quotes/${quoteId}/preview`, { replace: true });
        return;
      }

      setToastMessage("Draft saved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save quote";
      setSaveError(message);
    } finally {
      setSubmitAction(null);
    }
  }

  async function handleAssignCustomer(customerId: string): Promise<void> {
    setIsAssigningCustomer(true);

    try {
      await quoteService.updateQuote(quoteId, { customer_id: customerId });
      await refreshQuote();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to assign customer";
      throw new Error(message);
    } finally {
      setIsAssigningCustomer(false);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-28">
      <WorkflowScreenHeader
        title={activeDraft.title.trim().length > 0 ? activeDraft.title.trim() : quote.doc_number ?? "Review Quote"}
        subtitle={quote?.doc_number}
        backLabel={backLabel}
        onBack={() => requestNavigation({ to: backTarget, replace: true })}
        onExitHome={() => requestNavigation({ to: HOME_ROUTE, replace: true })}
      />

      <ReviewFormContent
        id={quoteId}
        quote={quote}
        draft={activeDraft}
        locationNotice={locationState.notice}
        loadError={loadError}
        saveError={saveError}
        requiresCustomerAssignment={requiresCustomerAssignment}
        canReassignCustomer={canReassignCustomer}
        isInteractionLocked={isInteractionLocked}
        hasVisibleConfidenceNotes={hasVisibleConfidenceNotes}
        confidenceNotes={confidenceNotes}
        lineItemSum={lineItemSum}
        suggestedTaxRate={suggestedTaxRate}
        onRequestAssignment={() => setIsAssignmentSheetOpen(true)}
        onAddVoiceNote={() => {
          void handleAddVoiceNote();
        }}
        onDismissConfidence={(noteIndex) => {
          const nextNotes = confidenceNotes.filter((_, index) => index !== noteIndex);
          writeQuoteConfidenceNotes(quoteId, nextNotes);
          setConfidenceNotes(nextNotes);
        }}
        onTitleChange={(nextTitle) => {
          setToastMessage(null);
          setDraft((currentDraft) => ({ ...currentDraft, title: nextTitle }));
        }}
        onEditLineItem={(lineItemIndex) => {
          if (isInteractionLocked || !activeDraft.lineItems[lineItemIndex]) {
            return;
          }
          setLineItemSheetState({ mode: "edit", index: lineItemIndex });
        }}
        onAddLineItem={() => {
          if (isInteractionLocked || activeDraft.lineItems.length >= DOCUMENT_LINE_ITEMS_MAX_ITEMS) {
            return;
          }
          setLineItemSheetState({ mode: "add" });
        }}
        onTotalChange={(nextTotal) => {
          setToastMessage(null);
          setDraft((currentDraft) => ({ ...currentDraft, total: nextTotal }));
        }}
        onTaxRateChange={(nextTaxRate) => {
          setToastMessage(null);
          setDraft((currentDraft) => ({ ...currentDraft, taxRate: nextTaxRate }));
        }}
        onDiscountTypeChange={(nextDiscountType) => {
          setToastMessage(null);
          setDraft((currentDraft) => ({ ...currentDraft, discountType: nextDiscountType }));
        }}
        onDiscountValueChange={(nextDiscountValue) => {
          setToastMessage(null);
          setDraft((currentDraft) => ({ ...currentDraft, discountValue: nextDiscountValue }));
        }}
        onDepositAmountChange={(nextDepositAmount) => {
          setToastMessage(null);
          setDraft((currentDraft) => ({ ...currentDraft, depositAmount: nextDepositAmount }));
        }}
        onNotesChange={(nextNotes) => {
          setToastMessage(null);
          setDraft((currentDraft) => ({ ...currentDraft, notes: nextNotes }));
        }}
      />

      <ReviewActionFooter
        requiresCustomerAssignment={requiresCustomerAssignment}
        isInteractionLocked={isInteractionLocked}
        isSavingDraft={submitAction === "save"}
        isContinuing={submitAction === "continue"}
        onSaveDraft={() => void saveDraft("save")}
        onContinueToPreview={() => void saveDraft("continue")}
      />

      {isAssignmentSheetOpen ? (
        <ReviewCustomerAssignmentSheet
          open={isAssignmentSheetOpen}
          currentCustomerId={quote.customer_id}
          onClose={() => setIsAssignmentSheetOpen(false)}
          onAssignCustomer={handleAssignCustomer}
        />
      ) : null}

      {lineItemSheetState ? (
        <LineItemEditSheet
          open
          mode={lineItemSheetState.mode}
          initialLineItem={lineItemSheetInitialItem}
          onClose={() => setLineItemSheetState(null)}
          onSave={(nextLineItem) => {
            const nextSheetState = lineItemSheetState;
            setToastMessage(null);
            setDraft((currentDraft) => applyLineItemSheetSave(currentDraft, nextSheetState, nextLineItem));
            setLineItemSheetState(null);
          }}
          onDelete={lineItemSheetState.mode === "edit"
            ? () => {
                const nextSheetState = lineItemSheetState;
                setToastMessage(null);
                setDraft((currentDraft) => applyLineItemSheetDelete(currentDraft, nextSheetState));
                setLineItemSheetState(null);
              }
            : undefined}
        />
      ) : null}

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />

      {showLeaveWarning ? (
        <ConfirmModal
          title="Leave this screen?"
          body="You have unsaved quote edits. Leaving now will discard those changes."
          confirmLabel="Leave without saving"
          cancelLabel="Stay"
          onConfirm={handleLeaveConfirm}
          onCancel={handleLeaveCancel}
          variant="destructive"
        />
      ) : null}
    </main>
  );
}
