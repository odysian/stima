import type { InvoiceStatus } from "@/features/invoices/types/invoice-status";

const EDITABLE_INVOICE_STATUSES = new Set<InvoiceStatus>(["draft", "ready", "sent", "paid", "void"]);

export function isInvoiceEditableStatus(status: InvoiceStatus): boolean {
  return EDITABLE_INVOICE_STATUSES.has(status);
}
