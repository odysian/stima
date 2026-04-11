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
    has_active_share: currentInvoice.has_active_share,
    updated_at: updatedInvoice.updated_at,
    line_items: updatedInvoice.line_items,
  };
}

interface BuildInvoiceOutcomeOverflowItemsArgs {
  status: InvoiceStatus | null;
  hasActiveShare: boolean;
  isBusy: boolean;
  onRevokeShareRequest: () => void;
  onMarkPaidRequest: () => void;
  onMarkVoidRequest: () => void;
}

export function buildInvoiceOutcomeOverflowItems({
  status,
  hasActiveShare,
  isBusy,
  onRevokeShareRequest,
  onMarkPaidRequest,
  onMarkVoidRequest,
}: BuildInvoiceOutcomeOverflowItemsArgs): OverflowMenuItem[] {
  const revokeItem: OverflowMenuItem = {
    label: "Revoke Link",
    icon: "link_off",
    tone: "destructive",
    disabled: isBusy,
    onSelect: onRevokeShareRequest,
  };

  if (status === "sent") {
    const items: OverflowMenuItem[] = [
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
    if (hasActiveShare) {
      items.unshift(revokeItem);
    }
    return items;
  }

  if (status === "paid") {
    const items: OverflowMenuItem[] = [
      {
        label: "Mark as Void",
        icon: "cancel",
        tone: "destructive",
        disabled: isBusy,
        onSelect: onMarkVoidRequest,
      },
    ];
    if (hasActiveShare) {
      items.unshift(revokeItem);
    }
    return items;
  }

  if (status === "void") {
    const items: OverflowMenuItem[] = [
      {
        label: "Mark as Paid",
        icon: "check_circle",
        disabled: isBusy,
        onSelect: onMarkPaidRequest,
      },
    ];
    if (hasActiveShare) {
      items.unshift(revokeItem);
    }
    return items;
  }

  return hasActiveShare ? [revokeItem] : [];
}