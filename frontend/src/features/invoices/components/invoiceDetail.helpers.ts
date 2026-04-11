import type { Invoice, InvoiceDetail } from "@/features/invoices/types/invoice.types";
import type { InvoiceStatus } from "@/features/invoices/types/invoice-status";
import type { OverflowMenuItem } from "@/shared/components/OverflowMenu";

export function mergeInvoiceDetailWithUpdate(
  currentInvoice: InvoiceDetail | null,
  updatedInvoice: Invoice,
): InvoiceDetail | null {
  if (!currentInvoice) {
    return currentInvoice;
  }

  return {
    ...currentInvoice,
    title: updatedInvoice.title,
    status: updatedInvoice.status,
    due_date: updatedInvoice.due_date,
    total_amount: updatedInvoice.total_amount,
    notes: updatedInvoice.notes,
    shared_at: updatedInvoice.shared_at,
    share_token: updatedInvoice.share_token,
    updated_at: updatedInvoice.updated_at,
    line_items: updatedInvoice.line_items,
  };
}

interface BuildInvoiceOutcomeOverflowItemsArgs {
  status: InvoiceStatus | null;
  isBusy: boolean;
  onMarkPaidRequest: () => void;
  onMarkVoidRequest: () => void;
}

export function buildInvoiceOutcomeOverflowItems({
  status,
  isBusy,
  onMarkPaidRequest,
  onMarkVoidRequest,
}: BuildInvoiceOutcomeOverflowItemsArgs): OverflowMenuItem[] {
  if (status === "sent") {
    return [
      {
        label: "Mark as Paid",
        icon: "check_circle",
        disabled: isBusy,
        onSelect: onMarkPaidRequest,
      },
      {
        label: "Mark as Void",
        icon: "cancel",
        tone: "destructive",
        disabled: isBusy,
        onSelect: onMarkVoidRequest,
      },
    ];
  }

  if (status === "paid") {
    return [
      {
        label: "Mark as Void",
        icon: "cancel",
        tone: "destructive",
        disabled: isBusy,
        onSelect: onMarkVoidRequest,
      },
    ];
  }

  if (status === "void") {
    return [
      {
        label: "Mark as Paid",
        icon: "check_circle",
        disabled: isBusy,
        onSelect: onMarkPaidRequest,
      },
    ];
  }

  return [];
}