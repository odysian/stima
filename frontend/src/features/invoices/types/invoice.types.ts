import type { InvoiceStatus } from "@/features/invoices/types/invoice-status";
import type { LineItem } from "@/features/quotes/types/quote.types";

export interface Invoice {
  id: string;
  customer_id: string;
  doc_number: string;
  title: string | null;
  status: InvoiceStatus;
  total_amount: number | null;
  notes: string | null;
  due_date: string | null;
  shared_at: string | null;
  share_token: string | null;
  source_document_id: string;
  line_items: LineItem[];
  created_at: string;
  updated_at: string;
}

export interface InvoiceDetail extends Invoice {
  source_quote_number: string;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
}

export interface InvoiceUpdateRequest {
  due_date: string;
}
