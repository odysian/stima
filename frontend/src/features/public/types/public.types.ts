import type { DiscountType } from "@/shared/lib/pricing";

export type PublicQuoteStatus = "shared" | "viewed" | "approved" | "declined";

export interface PublicQuoteLineItem {
  description: string;
  details: string | null;
  price: number | null;
}

export interface PublicQuote {
  business_name: string | null;
  customer_name: string;
  doc_number: string;
  title: string | null;
  status: PublicQuoteStatus;
  total_amount: number | null;
  tax_rate: number | null;
  discount_type: DiscountType | null;
  discount_value: number | null;
  deposit_amount: number | null;
  notes: string | null;
  issued_date: string;
  logo_url: string;
  download_url: string;
  line_items: PublicQuoteLineItem[];
}
