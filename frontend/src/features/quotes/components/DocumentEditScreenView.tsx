import { DocumentEditOverlays } from "@/features/quotes/components/DocumentEditOverlays";
import { ReviewActionFooter } from "@/features/quotes/components/ReviewActionFooter";
import { ReviewFormContent } from "@/features/quotes/components/ReviewFormContent";
import { isInvoiceDocument } from "@/features/quotes/components/documentEditUtils";
import type { ReviewLineItemSheetState } from "@/features/quotes/components/reviewLineItemSheetState";
import { type DocumentEditDraft, type PersistedEditableDocument } from "@/features/quotes/hooks/usePersistedReview";
import type { ExtractionReviewHiddenDetails, ExtractionTier, HiddenItemState, LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import type { LineItemCatalogItem } from "@/features/line-item-catalog/types/lineItemCatalog.types";
import { WorkflowScreenHeader } from "@/shared/components/WorkflowScreenHeader";

interface DocumentEditScreenViewProps {
  document: PersistedEditableDocument;
  activeDraft: DocumentEditDraft;
  backLabel: string;
  backTarget: string;
  loadError: string | null;
  saveError: string | null;
  locationNotice?: string;
  requiresCustomerAssignment: boolean;
  canReassignCustomer: boolean;
  isInteractionLocked: boolean;
  notesReviewPending: boolean;
  pricingReviewPending: boolean;
  extractionTier: ExtractionTier | null;
  extractionDegradedReasonCode: string | null;
  hiddenDetails?: ExtractionReviewHiddenDetails;
  hiddenDetailState?: Record<string, HiddenItemState>;
  lineItemSum: number;
  suggestedTaxRate: number | null;
  isMutatingHiddenItems: boolean;
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
  onTitleChange: (nextTitle: string) => void;
  onEditLineItem: (lineItemIndex: number) => void;
  onReorderLineItems: (sourceIndex: number, targetIndex: number) => void;
  onAddLineItem: () => void;
  onTotalChange: (nextTotal: number | null) => void;
  onTaxRateChange: (nextTaxRate: number | null) => void;
  onDiscountTypeChange: (nextDiscountType: "fixed" | "percent" | null) => void;
  onDiscountValueChange: (nextDiscountValue: number | null) => void;
  onDepositAmountChange: (nextDepositAmount: number | null) => void;
  onNotesChange: (nextNotes: string) => void;
  onDismissHiddenItem: (itemId: string) => Promise<void>;
  onSaveDraft: () => void;
  onPrimaryAction: () => void;
  onCloseAssignment: () => void;
  onAssignCustomer: (customerId: string) => Promise<void>;
  onCloseLineItemSheet: () => void;
  onSaveLineItem: (nextLineItem: LineItemDraftWithFlags) => void;
  onSaveLineItemToCatalog: (lineItem: {
    title: string;
    details: string | null;
    defaultPrice: number | null;
  }) => Promise<LineItemCatalogItem>;
  onDeleteLineItemFromCatalog: (id: string) => Promise<void>;
  onLoadLineItemCatalogItems: () => Promise<LineItemCatalogItem[]>;
  onRequestDeleteLineItemFromSheet: () => void;
  showLineItemDeleteConfirm: boolean;
  lineItemDeleteDescription: string;
  onConfirmDeleteLineItem: () => void;
  onCancelDeleteLineItem: () => void;
  onDismissToast: () => void;
  onLeaveConfirm: () => void;
  onLeaveCancel: () => void;
}

export function DocumentEditScreenView({
  document,
  activeDraft,
  backLabel,
  backTarget,
  loadError,
  saveError,
  locationNotice,
  requiresCustomerAssignment,
  canReassignCustomer,
  isInteractionLocked,
  notesReviewPending,
  pricingReviewPending,
  extractionTier,
  extractionDegradedReasonCode,
  hiddenDetails,
  hiddenDetailState,
  lineItemSum,
  suggestedTaxRate,
  isMutatingHiddenItems,
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
  onTitleChange,
  onEditLineItem,
  onReorderLineItems,
  onAddLineItem,
  onTotalChange,
  onTaxRateChange,
  onDiscountTypeChange,
  onDiscountValueChange,
  onDepositAmountChange,
  onNotesChange,
  onDismissHiddenItem,
  onSaveDraft,
  onPrimaryAction,
  onCloseAssignment,
  onAssignCustomer,
  onCloseLineItemSheet,
  onSaveLineItem,
  onSaveLineItemToCatalog,
  onDeleteLineItemFromCatalog,
  onLoadLineItemCatalogItems,
  onRequestDeleteLineItemFromSheet,
  showLineItemDeleteConfirm,
  lineItemDeleteDescription,
  onConfirmDeleteLineItem,
  onCancelDeleteLineItem,
  onDismissToast,
  onLeaveConfirm,
  onLeaveCancel,
}: DocumentEditScreenViewProps): React.ReactElement {
  return (
    <main className="min-h-screen bg-background pb-28">
      <WorkflowScreenHeader
        title="Review & Edit"
        subtitle="Confirm line items and pricing"
        backLabel={backLabel}
        onBack={() => onRequestNavigation({ to: backTarget, replace: true })}
      />

      <ReviewFormContent
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
        notesReviewPending={notesReviewPending}
        pricingReviewPending={pricingReviewPending}
        extractionTier={extractionTier}
        extractionDegradedReasonCode={extractionDegradedReasonCode}
        hiddenDetails={hiddenDetails}
        hiddenDetailState={hiddenDetailState}
        lineItemSum={lineItemSum}
        suggestedTaxRate={suggestedTaxRate}
        isMutatingHiddenItems={isMutatingHiddenItems}
        onDocumentTypeChange={onDocumentTypeChange}
        onDueDateChange={onDueDateChange}
        onRequestAssignment={onOpenAssignment}
        onTitleChange={onTitleChange}
        onEditLineItem={onEditLineItem}
        onReorderLineItems={onReorderLineItems}
        onAddLineItem={onAddLineItem}
        onTotalChange={onTotalChange}
        onTaxRateChange={onTaxRateChange}
        onDiscountTypeChange={onDiscountTypeChange}
        onDiscountValueChange={onDiscountValueChange}
        onDepositAmountChange={onDepositAmountChange}
        onNotesChange={onNotesChange}
        onDismissHiddenItem={onDismissHiddenItem}
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
        onSaveLineItemToCatalog={onSaveLineItemToCatalog}
        onDeleteLineItemFromCatalog={onDeleteLineItemFromCatalog}
        onLoadLineItemCatalogItems={onLoadLineItemCatalogItems}
        onRequestDeleteLineItemFromSheet={onRequestDeleteLineItemFromSheet}
        showLineItemDeleteConfirm={showLineItemDeleteConfirm}
        lineItemDeleteDescription={lineItemDeleteDescription}
        onConfirmDeleteLineItem={onConfirmDeleteLineItem}
        onCancelDeleteLineItem={onCancelDeleteLineItem}
        toastMessage={toastMessage}
        onDismissToast={onDismissToast}
        showLeaveWarning={showLeaveWarning}
        onLeaveConfirm={onLeaveConfirm}
        onLeaveCancel={onLeaveCancel}
      />
    </main>
  );
}
