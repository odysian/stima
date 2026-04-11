import { DocumentEditOverlays } from "@/features/quotes/components/DocumentEditOverlays";
import { ReviewActionFooter } from "@/features/quotes/components/ReviewActionFooter";
import { ReviewFormContent } from "@/features/quotes/components/ReviewFormContent";
import { isInvoiceDocument } from "@/features/quotes/components/documentEditUtils";
import type { ReviewLineItemSheetState } from "@/features/quotes/components/reviewLineItemSheetState";
import { type DocumentEditDraft, type PersistedEditableDocument } from "@/features/quotes/hooks/usePersistedReview";
import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { HOME_ROUTE } from "@/features/quotes/utils/workflowNavigation";
import { WorkflowScreenHeader } from "@/shared/components/WorkflowScreenHeader";

interface DocumentEditScreenViewProps {
  document: PersistedEditableDocument;
  activeDraft: DocumentEditDraft;
  documentId: string;
  backLabel: string;
  backTarget: string;
  loadError: string | null;
  saveError: string | null;
  locationNotice?: string;
  requiresCustomerAssignment: boolean;
  canReassignCustomer: boolean;
  isInteractionLocked: boolean;
  hasVisibleConfidenceNotes: boolean;
  confidenceNotes: string[];
  lineItemSum: number;
  suggestedTaxRate: number | null;
  isTypeSelectorLocked: boolean;
  isAssignmentSheetOpen: boolean;
  lineItemSheetState: ReviewLineItemSheetState | null;
  lineItemSheetInitialItem: LineItemDraftWithFlags;
  toastMessage: string | null;
  showLeaveWarning: boolean;
  isSavingDraft: boolean;
  isContinuing: boolean;
  onRequestNavigation: (target: { to: string; replace?: boolean }) => void;
  onDocumentTypeChange: (nextType: "quote" | "invoice") => void;
  onDueDateChange: (nextDueDate: string) => void;
  onOpenAssignment: () => void;
  onAddVoiceNote: () => void;
  onDismissConfidence: (noteIndex: number) => void;
  onTitleChange: (nextTitle: string) => void;
  onEditLineItem: (lineItemIndex: number) => void;
  onAddLineItem: () => void;
  onTotalChange: (nextTotal: number | null) => void;
  onTaxRateChange: (nextTaxRate: number | null) => void;
  onDiscountTypeChange: (nextDiscountType: "fixed" | "percent" | null) => void;
  onDiscountValueChange: (nextDiscountValue: number | null) => void;
  onDepositAmountChange: (nextDepositAmount: number | null) => void;
  onNotesChange: (nextNotes: string) => void;
  onSaveDraft: () => void;
  onPrimaryAction: () => void;
  onCloseAssignment: () => void;
  onAssignCustomer: (customerId: string) => Promise<void>;
  onCloseLineItemSheet: () => void;
  onSaveLineItem: (nextLineItem: LineItemDraftWithFlags) => void;
  onDeleteLineItem?: () => void;
  onDismissToast: () => void;
  onLeaveConfirm: () => void;
  onLeaveCancel: () => void;
}

export function DocumentEditScreenView({
  document,
  activeDraft,
  documentId,
  backLabel,
  backTarget,
  loadError,
  saveError,
  locationNotice,
  requiresCustomerAssignment,
  canReassignCustomer,
  isInteractionLocked,
  hasVisibleConfidenceNotes,
  confidenceNotes,
  lineItemSum,
  suggestedTaxRate,
  isTypeSelectorLocked,
  isAssignmentSheetOpen,
  lineItemSheetState,
  lineItemSheetInitialItem,
  toastMessage,
  showLeaveWarning,
  isSavingDraft,
  isContinuing,
  onRequestNavigation,
  onDocumentTypeChange,
  onDueDateChange,
  onOpenAssignment,
  onAddVoiceNote,
  onDismissConfidence,
  onTitleChange,
  onEditLineItem,
  onAddLineItem,
  onTotalChange,
  onTaxRateChange,
  onDiscountTypeChange,
  onDiscountValueChange,
  onDepositAmountChange,
  onNotesChange,
  onSaveDraft,
  onPrimaryAction,
  onCloseAssignment,
  onAssignCustomer,
  onCloseLineItemSheet,
  onSaveLineItem,
  onDeleteLineItem,
  onDismissToast,
  onLeaveConfirm,
  onLeaveCancel,
}: DocumentEditScreenViewProps): React.ReactElement {
  return (
    <main className="min-h-screen bg-background pb-28">
      <WorkflowScreenHeader
        title={activeDraft.title.trim().length > 0
          ? activeDraft.title.trim()
          : document.doc_number ?? (activeDraft.docType === "invoice" ? "Edit Invoice" : "Review Quote")}
        subtitle={document.doc_number}
        backLabel={backLabel}
        onBack={() => onRequestNavigation({ to: backTarget, replace: true })}
        onExitHome={() => onRequestNavigation({ to: HOME_ROUTE, replace: true })}
      />

      <ReviewFormContent
        id={documentId}
        customerName={isInvoiceDocument(document) ? document.customer.name : document.customer_name}
        draft={activeDraft}
        documentType={activeDraft.docType}
        isTypeSelectorLocked={isTypeSelectorLocked}
        isInvoiceTypeDisabled={requiresCustomerAssignment}
        locationNotice={locationNotice}
        loadError={loadError}
        saveError={saveError}
        requiresCustomerAssignment={requiresCustomerAssignment}
        canReassignCustomer={canReassignCustomer}
        isInteractionLocked={isInteractionLocked}
        hasVisibleConfidenceNotes={hasVisibleConfidenceNotes}
        confidenceNotes={confidenceNotes}
        lineItemSum={lineItemSum}
        suggestedTaxRate={suggestedTaxRate}
        onDocumentTypeChange={onDocumentTypeChange}
        onDueDateChange={onDueDateChange}
        onRequestAssignment={onOpenAssignment}
        onAddVoiceNote={onAddVoiceNote}
        onDismissConfidence={onDismissConfidence}
        onTitleChange={onTitleChange}
        onEditLineItem={onEditLineItem}
        onAddLineItem={onAddLineItem}
        onTotalChange={onTotalChange}
        onTaxRateChange={onTaxRateChange}
        onDiscountTypeChange={onDiscountTypeChange}
        onDiscountValueChange={onDiscountValueChange}
        onDepositAmountChange={onDepositAmountChange}
        onNotesChange={onNotesChange}
      />

      <ReviewActionFooter
        requiresCustomerAssignment={requiresCustomerAssignment}
        isInteractionLocked={isInteractionLocked}
        isSavingDraft={isSavingDraft}
        isContinuing={isContinuing}
        primaryActionLabel={activeDraft.docType === "invoice" ? "Create Invoice" : "Continue to Preview"}
        onSaveDraft={onSaveDraft}
        onPrimaryAction={onPrimaryAction}
      />

      <DocumentEditOverlays
        isAssignmentSheetOpen={isAssignmentSheetOpen}
        currentCustomerId={document.customer_id}
        onCloseAssignment={onCloseAssignment}
        onAssignCustomer={onAssignCustomer}
        lineItemSheetState={lineItemSheetState}
        lineItemSheetInitialItem={lineItemSheetInitialItem}
        onCloseLineItemSheet={onCloseLineItemSheet}
        onSaveLineItem={onSaveLineItem}
        onDeleteLineItem={onDeleteLineItem}
        toastMessage={toastMessage}
        onDismissToast={onDismissToast}
        showLeaveWarning={showLeaveWarning}
        onLeaveConfirm={onLeaveConfirm}
        onLeaveCancel={onLeaveCancel}
      />
    </main>
  );
}
