import { useEffect, useMemo, useState } from "react";
import { useBeforeUnload, useLocation, useNavigate, useParams } from "react-router-dom";

import { profileService } from "@/features/profile/services/profileService";
import { DocumentEditScreenView } from "@/features/quotes/components/DocumentEditScreenView";
import { buildDefaultInvoiceDueDate, buildDocumentSnapshotKey, buildSaveValidationMessage, isInvoiceDocument, persistDocumentDraft } from "@/features/quotes/components/documentEditUtils";
import { useCaptureDetailsWarning } from "@/features/quotes/hooks/useCaptureDetailsWarning";
import { useHiddenDetailLifecycle } from "@/features/quotes/hooks/useHiddenDetailLifecycle";
import { applyLineItemReorder, applyLineItemSheetDelete, applyLineItemSheetSave, resolveLineItemSheetInitialItem, type ReviewLineItemSheetState } from "@/features/quotes/components/reviewLineItemSheetState";
import { buildLineItemSubmitState, EMPTY_LINE_ITEM } from "@/features/quotes/components/reviewScreenUtils";
import { usePersistedReview } from "@/features/quotes/hooks/usePersistedReview";
import { quoteService } from "@/features/quotes/services/quoteService";
import { HOME_ROUTE } from "@/features/quotes/utils/workflowNavigation";
import { buildDraftSnapshot, readReviewLocationState, resolveBackTarget } from "@/features/quotes/utils/reviewScreenState";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { DOCUMENT_LINE_ITEMS_MAX_ITEMS } from "@/shared/lib/inputLimits";

export function DocumentEditScreen(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const {
    document,
    draft,
    setDraft,
    clearDraft,
    isLoadingDocument,
    loadError,
    refreshDocument,
  } = usePersistedReview(id);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [submitAction, setSubmitAction] = useState<"save" | "continue" | null>(null);
  const [isAssignmentSheetOpen, setIsAssignmentSheetOpen] = useState(false);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [continueWarningReason, setContinueWarningReason] = useState<"review" | "capture-details" | null>(null);
  const [pendingNavigationTarget, setPendingNavigationTarget] = useState<{
    to: string;
    replace?: boolean;
  } | null>(null);
  const [savedSnapshotKey, setSavedSnapshotKey] = useState<string | null>(null);
  const [snapshotQuoteId, setSnapshotQuoteId] = useState<string | null>(null);
  const [suggestedTaxRate, setSuggestedTaxRate] = useState<number | null>(null);
  const [isAssigningCustomer, setIsAssigningCustomer] = useState(false);
  const [hasAppliedReseedFromLocation, setHasAppliedReseedFromLocation] = useState(false);
  const [lineItemSheetState, setLineItemSheetState] = useState<ReviewLineItemSheetState | null>(null);
  const [pendingLineItemDeleteIndex, setPendingLineItemDeleteIndex] = useState<number | null>(null);
  const locationState = useMemo(() => readReviewLocationState(location.state), [location.state]);
  const requiresCustomerAssignment = useMemo(() => {
    if (!document || isInvoiceDocument(document)) {
      return false;
    }
    if (typeof document.requires_customer_assignment === "boolean") {
      return document.requires_customer_assignment;
    }
    return document.customer_id === null;
  }, [document]);
  const canReassignCustomer = useMemo(() => {
    if (!document || isInvoiceDocument(document)) {
      return false;
    }
    if (typeof document.can_reassign_customer === "boolean") {
      return document.can_reassign_customer;
    }
    return (document.status === "draft" || document.status === "ready") && !document.linked_invoice;
  }, [document]);
  const isTypeSelectorLocked = useMemo(() => {
    if (!document) {
      return true;
    }
    if (document.shared_at !== null) {
      return true;
    }
    return document.status !== "draft" && document.status !== "ready";
  }, [document]);
  const currentSnapshotKey = useMemo(() => {
    if (!draft) {
      return null;
    }
    return JSON.stringify(buildDraftSnapshot(draft));
  }, [draft]);
  const documentId = id ?? "";
  const {
    isMutatingHiddenItems,
    dismissHiddenItem,
  } = useHiddenDetailLifecycle({
    canMutate: Boolean(document && !isInvoiceDocument(document)),
    documentId,
    refreshDocument: async () => refreshDocument(),
    setSaveError,
  });
  const extractionReviewMetadata = document && !isInvoiceDocument(document)
    ? document.extraction_review_metadata
    : undefined;
  const hiddenDetailState = extractionReviewMetadata?.hidden_detail_state;
  const { shouldWarnOnContinue, markCaptureDetailsOpened } = useCaptureDetailsWarning({
    documentId,
    isQuoteDocument: draft?.docType === "quote",
    hiddenDetails: extractionReviewMetadata?.hidden_details,
    hiddenDetailState,
  });
  useEffect(() => {
    if (!id) {
      return;
    }
    setHasAppliedReseedFromLocation(false);
  }, [id]);
  useEffect(() => {
    if (!id || !locationState.reseedDraft || hasAppliedReseedFromLocation) {
      return;
    }
    setHasAppliedReseedFromLocation(true);
    void refreshDocument({ reseedDraft: true }).catch(() => {
      // Existing load/save error messaging covers failed refreshes.
    });
  }, [hasAppliedReseedFromLocation, id, locationState.reseedDraft, refreshDocument]);
  useEffect(() => {
    if (!document || !draft || !currentSnapshotKey) {
      return;
    }
    if (snapshotQuoteId !== document.id) {
      setSnapshotQuoteId(document.id);
      setSavedSnapshotKey(currentSnapshotKey);
    }
  }, [currentSnapshotKey, document, draft, snapshotQuoteId]);

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
        <FeedbackMessage variant="error">Missing document id.</FeedbackMessage>
      </main>
    );
  }
  const activeDocumentType = draft?.docType ?? (document && isInvoiceDocument(document) ? "invoice" : "quote");
  const shouldUseQuoteListBackTarget = locationState.origin === "preview" && requiresCustomerAssignment;
  const invoiceBackTarget = `/invoices/${documentId}`;
  const quoteBackTarget = shouldUseQuoteListBackTarget
    ? HOME_ROUTE
    : resolveBackTarget(locationState, documentId);
  const backTarget = activeDocumentType === "invoice" ? invoiceBackTarget : quoteBackTarget;
  const backLabel = activeDocumentType === "invoice"
    ? "Back to invoice"
    : (shouldUseQuoteListBackTarget
      ? "Back to quotes"
      : (locationState.origin === "preview" ? "Back to preview" : "Back to quotes"));
  if (isLoadingDocument || !draft) {
    return (
      <main className="min-h-screen bg-background px-4 pt-20">
        {isLoadingDocument ? (
          <p role="status" className="text-sm text-on-surface-variant">Loading document...</p>
        ) : null}
        {loadError ? <FeedbackMessage variant="error">{loadError}</FeedbackMessage> : null}
      </main>
    );
  }
  if (!document) {
    return (
      <main className="min-h-screen bg-background px-4 pt-20">
        <FeedbackMessage variant="error">{loadError ?? "Unable to load document."}</FeedbackMessage>
      </main>
    );
  }
  const activeDocument = document;
  const activeDraft = draft;
  const {
    hasInvalidLineItems,
    lineItemsForSubmit,
    lineItemSum,
  } = buildLineItemSubmitState(activeDraft.lineItems);
  const notesReviewPending = activeDraft.docType === "quote"
    && Boolean(extractionReviewMetadata?.review_state.notes_pending);
  const pricingReviewPending = activeDraft.docType === "quote"
    && Boolean(extractionReviewMetadata?.review_state.pricing_pending);

  const isInteractionLocked = submitAction !== null || isAssigningCustomer;
  const lineItemSheetInitialItem = lineItemSheetState
    ? resolveLineItemSheetInitialItem(activeDraft, lineItemSheetState, EMPTY_LINE_ITEM)
    : EMPTY_LINE_ITEM;
  async function saveDraft(nextAction: "save" | "continue"): Promise<void> {
    setSaveError(null);
    setToastMessage(null);
    const validationMessage = buildSaveValidationMessage({
      draft: activeDraft,
      lineItemsForSubmit,
      hasInvalidLineItems,
    });
    if (validationMessage) {
      setSaveError(validationMessage ?? "Unable to save quote.");
      return;
    }
    setSubmitAction(nextAction);
    try {
      await persistDocumentDraft({
        document: activeDocument,
        documentId,
        draft: activeDraft,
        lineItemsForSubmit,
      });
      const refreshedDocument = await refreshDocument({ reseedDraft: true });
      setSavedSnapshotKey(buildDocumentSnapshotKey(refreshedDocument));

      const typeChanged = isInvoiceDocument(activeDocument) !== isInvoiceDocument(refreshedDocument);
      if (typeChanged) {
        navigate(location.pathname, { replace: true, state: {} });
      }

      if (nextAction === "continue") {
        if (activeDraft.docType === "invoice") {
          navigate(`/invoices/${documentId}`, { replace: true });
          return;
        }
        navigate(`/quotes/${documentId}/preview`, { replace: true });
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
    if (isInvoiceDocument(activeDocument)) {
      return;
    }
    setIsAssigningCustomer(true);
    try {
      await quoteService.updateQuote(documentId, { customer_id: customerId });
      await refreshDocument();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to assign customer";
      throw new Error(message);
    } finally {
      setIsAssigningCustomer(false);
    }
  }
  return (
    <DocumentEditScreenView
      document={activeDocument}
      activeDraft={activeDraft}
      backLabel={backLabel}
      backTarget={backTarget}
      loadError={loadError}
      saveError={saveError}
      locationNotice={locationState.notice}
      requiresCustomerAssignment={requiresCustomerAssignment}
      canReassignCustomer={canReassignCustomer}
      isInteractionLocked={isInteractionLocked}
      notesReviewPending={notesReviewPending}
      pricingReviewPending={pricingReviewPending}
      extractionTier={!isInvoiceDocument(activeDocument) ? activeDocument.extraction_tier : null}
      extractionDegradedReasonCode={!isInvoiceDocument(activeDocument) ? activeDocument.extraction_degraded_reason_code : null}
      hiddenDetails={extractionReviewMetadata?.hidden_details}
      hiddenDetailState={hiddenDetailState}
      lineItemSum={lineItemSum}
      suggestedTaxRate={suggestedTaxRate}
      isMutatingHiddenItems={isMutatingHiddenItems}
      isTypeSelectorLocked={isTypeSelectorLocked}
      isAssignmentSheetOpen={isAssignmentSheetOpen}
      lineItemSheetState={lineItemSheetState}
      lineItemSheetInitialItem={lineItemSheetInitialItem}
      toastMessage={toastMessage}
      showLeaveWarning={showLeaveWarning}
      continueWarningReason={continueWarningReason}
      isSavingDraft={submitAction === "save"}
      isContinuing={submitAction === "continue"}
      onRequestNavigation={requestNavigation}
      onDocumentTypeChange={(nextType) => {
        if (isTypeSelectorLocked) {
          return;
        }
        if (nextType === "invoice" && requiresCustomerAssignment) {
          return;
        }

        setToastMessage(null);
        setDraft((currentDraft) => ({
          ...currentDraft,
          docType: nextType,
          dueDate: nextType === "invoice"
            ? (currentDraft.dueDate.trim().length > 0 ? currentDraft.dueDate : buildDefaultInvoiceDueDate())
            : "",
        }));
      }}
      onDueDateChange={(nextDueDate) => {
        setToastMessage(null);
        setDraft((currentDraft) => ({ ...currentDraft, dueDate: nextDueDate }));
      }}
      onOpenAssignment={() => setIsAssignmentSheetOpen(true)}
      onTitleChange={(nextTitle) => { setToastMessage(null); setDraft((currentDraft) => ({ ...currentDraft, title: nextTitle })); }}
      onEditLineItem={(lineItemIndex) => {
        if (isInteractionLocked || !activeDraft.lineItems[lineItemIndex]) {
          return;
        }
        setLineItemSheetState({ mode: "edit", index: lineItemIndex });
      }}
      onReorderLineItems={(sourceIndex, targetIndex) => {
        if (isInteractionLocked || sourceIndex === targetIndex) {
          return;
        }
        setToastMessage(null);
        setDraft((currentDraft) => applyLineItemReorder(currentDraft, sourceIndex, targetIndex));
      }}
      onAddLineItem={() => {
        if (isInteractionLocked || activeDraft.lineItems.length >= DOCUMENT_LINE_ITEMS_MAX_ITEMS) {
          return;
        }
        setLineItemSheetState({ mode: "add" });
      }}
      onTotalChange={(nextTotal) => { setToastMessage(null); setDraft((currentDraft) => ({ ...currentDraft, total: nextTotal })); }}
      onTaxRateChange={(nextTaxRate) => { setToastMessage(null); setDraft((currentDraft) => ({ ...currentDraft, taxRate: nextTaxRate })); }}
      onDiscountTypeChange={(nextDiscountType) => { setToastMessage(null); setDraft((currentDraft) => ({ ...currentDraft, discountType: nextDiscountType })); }}
      onDiscountValueChange={(nextDiscountValue) => { setToastMessage(null); setDraft((currentDraft) => ({ ...currentDraft, discountValue: nextDiscountValue })); }}
      onDepositAmountChange={(nextDepositAmount) => { setToastMessage(null); setDraft((currentDraft) => ({ ...currentDraft, depositAmount: nextDepositAmount })); }}
      onNotesChange={(nextNotes) => { setToastMessage(null); setDraft((currentDraft) => ({ ...currentDraft, notes: nextNotes })); }}
      onDismissHiddenItem={dismissHiddenItem}
      onCaptureDetailsOpen={markCaptureDetailsOpened}
      onSaveDraft={() => { void saveDraft("save"); }}
      onPrimaryAction={() => {
        if (activeDraft.docType === "quote" && (notesReviewPending || pricingReviewPending)) {
          setContinueWarningReason("review");
          return;
        }
        if (shouldWarnOnContinue) {
          setContinueWarningReason("capture-details");
          return;
        }
        void saveDraft("continue");
      }}
      onCloseAssignment={() => setIsAssignmentSheetOpen(false)}
      onAssignCustomer={handleAssignCustomer}
      onCloseLineItemSheet={() => setLineItemSheetState(null)}
      onSaveLineItem={(nextLineItem) => {
        const nextSheetState = lineItemSheetState;
        if (!nextSheetState) {
          return;
        }
        setToastMessage(null);
        setDraft((currentDraft) => applyLineItemSheetSave(currentDraft, nextSheetState, nextLineItem));
        setLineItemSheetState(null);
      }}
      onRequestDeleteLineItemFromSheet={() => {
        const nextSheetState = lineItemSheetState;
        if (
          isInteractionLocked
          || !nextSheetState
          || nextSheetState.mode !== "edit"
          || !activeDraft.lineItems[nextSheetState.index]
        ) {
          return;
        }
        setPendingLineItemDeleteIndex(nextSheetState.index);
      }}
      showLineItemDeleteConfirm={pendingLineItemDeleteIndex !== null}
      lineItemDeleteDescription={pendingLineItemDeleteIndex !== null
        ? (activeDraft.lineItems[pendingLineItemDeleteIndex]?.description.trim() || "Untitled line item")
        : "Untitled line item"}
      onConfirmDeleteLineItem={() => {
        const lineItemIndex = pendingLineItemDeleteIndex;
        if (lineItemIndex === null) {
          return;
        }
        setToastMessage(null);
        setDraft((currentDraft) => applyLineItemSheetDelete(currentDraft, { mode: "edit", index: lineItemIndex }));
        setLineItemSheetState((currentState) =>
          currentState?.mode === "edit" && currentState.index === lineItemIndex
            ? null
            : currentState);
        setPendingLineItemDeleteIndex(null);
      }}
      onCancelDeleteLineItem={() => setPendingLineItemDeleteIndex(null)}
      onDismissToast={() => setToastMessage(null)}
      onLeaveConfirm={handleLeaveConfirm}
      onLeaveCancel={handleLeaveCancel}
      onContinueConfirm={() => {
        setContinueWarningReason(null);
        void saveDraft("continue");
      }}
      onContinueCancel={() => setContinueWarningReason(null)}
    />
  );
}
