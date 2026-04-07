import type { Invoice, InvoiceDetail } from "@/features/invoices/types/invoice.types";

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