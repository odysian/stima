import type { InvoiceStatus } from "@/features/invoices/types/invoice-status";
import type {
  LineItem,
  LineItemDraft,
  PdfArtifact,
  QuoteSourceType,
} from "@/features/quotes/types/quote.types";
import type { DiscountType } from "@/shared/lib/pricing";

export interface InvoiceCreateRequest {
  customer_id: string;
  title: string | null;
  transcript: string;
  line_items: LineItemDraft[];
  total_amount: number | null;
  tax_rate: number | null;
  discount_type: DiscountType | null;
  discount_value: number | null;
  deposit_amount: number | null;
  notes: string;
  source_type: QuoteSourceType;
}

export interface Invoice {
  id: string;
  customer_id: string;
  doc_number: string;
  title: string | null;
  status: InvoiceStatus;
  total_amount: number | null;
  tax_rate: number | null;
  discount_type: DiscountType | null;
  discount_value: number | null;
  deposit_amount: number | null;
  notes: string | null;
  due_date: string | null;
  shared_at: string | null;
  share_token: string | null;
  source_document_id: string | null;
  line_items: LineItem[];
  created_at: string;
  updated_at: string;
}

export interface InvoiceListItem {
  id: string;
  customer_id: string;
  customer_name: string;
  doc_number: string;
  title: string | null;
  status: InvoiceStatus;
  total_amount: number | null;
  due_date: string | null;
  created_at: string;
  source_document_id: string | null;
}

export interface InvoiceDetail extends Invoice {
  source_quote_number: string | null;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  pdf_artifact: PdfArtifact;
}

export interface InvoiceUpdateRequest {
  title?: string | null;
  line_items?: LineItemDraft[];
  total_amount?: number | null;
  tax_rate?: number | null;
  discount_type?: DiscountType | null;
  discount_value?: number | null;
  deposit_amount?: number | null;
  notes?: string | null;
  due_date?: string;
}
