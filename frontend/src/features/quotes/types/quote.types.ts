import type { InvoiceStatus } from "@/features/invoices/types/invoice-status";
import type { DiscountType } from "@/shared/lib/pricing";

export interface LineItemDraft {
  description: string;
  details: string | null;
  price: number | null;
}

export interface LineItemExtracted extends LineItemDraft {
  flagged?: boolean;
  flag_reason?: string | null;
}

export interface LineItemDraftWithFlags extends LineItemDraft {
  flagged?: boolean;
  flagReason?: string | null;
}

export interface ExtractionResult {
  transcript: string;
  line_items: LineItemExtracted[];
  total: number | null;
  confidence_notes: string[];
  extraction_tier: ExtractionTier;
  extraction_degraded_reason_code: string | null;
}

export type JobStatus = "pending" | "running" | "success" | "failed" | "terminal";
export type JobType = "extraction" | "pdf" | "email";

export interface JobRecord {
  id: string;
  user_id: string;
  document_id: string | null;
  document_revision: number | null;
  job_type: JobType;
  status: JobStatus;
  attempts: number;
  terminal_error: string | null;
  quote_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobStatusResponse extends JobRecord {
  extraction_result: ExtractionResult | null;
}

export type QuoteExtractResponse =
  | { type: "async"; jobId: string }
  | { type: "sync"; quoteId: string; result: ExtractionResult };

export type PdfArtifactStatus = "missing" | "pending" | "ready" | "failed";

export interface PdfArtifact {
  status: PdfArtifactStatus;
  job_id: string | null;
  download_url: string | null;
  terminal_error: string | null;
}

export interface LineItem {
  id: string;
  description: string;
  details: string | null;
  price: number | null;
  sort_order: number;
}

export type QuoteStatus =
  | "draft"
  | "ready"
  | "shared"
  | "viewed"
  | "approved"
  | "declined";
export type QuoteSourceType = "text" | "voice";
export type ExtractionTier = "primary" | "degraded";

export interface QuotePricingFields {
  total_amount: number | null;
  tax_rate: number | null;
  discount_type: DiscountType | null;
  discount_value: number | null;
  deposit_amount: number | null;
}

export interface Quote {
  id: string;
  customer_id: string | null;
  doc_type?: "quote" | "invoice";
  doc_number: string;
  title: string | null;
  status: QuoteStatus;
  source_type: QuoteSourceType;
  transcript: string;
  total_amount: number | null;
  tax_rate: number | null;
  discount_type: DiscountType | null;
  discount_value: number | null;
  deposit_amount: number | null;
  notes: string | null;
  shared_at: string | null;
  share_token: string | null;
  line_items: LineItem[];
  created_at: string;
  updated_at: string;
}

export interface LinkedInvoiceSummary {
  id: string;
  doc_number: string;
  status: InvoiceStatus;
  due_date: string | null;
  total_amount: number | null;
  created_at: string;
}

export interface QuoteDetail extends Quote {
  has_active_share: boolean;
  extraction_tier: ExtractionTier | null;
  extraction_degraded_reason_code: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  requires_customer_assignment?: boolean;
  can_reassign_customer?: boolean;
  linked_invoice: LinkedInvoiceSummary | null;
  pdf_artifact: PdfArtifact;
}

export interface QuoteListItem {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  doc_number: string;
  title: string | null;
  status: QuoteStatus;
  total_amount: number | null;
  item_count: number;
  requires_customer_assignment?: boolean;
  can_reassign_customer?: boolean;
  created_at: string;
}

export interface QuoteCreateRequest {
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

export interface QuoteUpdateRequest {
  customer_id?: string | null;
  title?: string | null;
  transcript?: string;
  doc_type?: "quote" | "invoice";
  due_date?: string;
  line_items?: LineItemDraft[];
  total_amount?: number | null;
  tax_rate?: number | null;
  discount_type?: DiscountType | null;
  discount_value?: number | null;
  deposit_amount?: number | null;
  notes?: string | null;
}
