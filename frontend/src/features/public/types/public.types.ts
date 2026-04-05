import type { DiscountType } from "@/shared/lib/pricing";

export type PublicQuoteStatus = "shared" | "viewed" | "approved" | "declined";
export type PublicInvoiceStatus = "sent";

export interface PublicDocumentLineItem {
  description: string;
  details: string | null;
  price: number | null;
}

interface PublicDocumentBase {
  business_name: string | null;
  customer_name: string;
  doc_number: string;
  title: string | null;
  total_amount: number | null;
  tax_rate: number | null;
  discount_type: DiscountType | null;
  discount_value: number | null;
  deposit_amount: number | null;
  notes: string | null;
  issued_date: string;
  logo_url: string;
  download_url: string;
  line_items: PublicDocumentLineItem[];
}

export interface PublicQuote extends PublicDocumentBase {
  doc_type: "quote";
  status: PublicQuoteStatus;
}

export interface PublicInvoice extends PublicDocumentBase {
  doc_type: "invoice";
  status: PublicInvoiceStatus;
  due_date: string | null;
}

export type PublicDocument = PublicQuote | PublicInvoice;
