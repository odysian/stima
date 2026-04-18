import type { InvoiceStatus } from "@/features/invoices/types/invoice-status";
import type { DiscountType } from "@/shared/lib/pricing";

export type PriceStatus = "priced" | "included" | "unknown";

export interface LineItemDraft {
  description: string;
  details: string | null;
  price: number | null;
  price_status?: PriceStatus;
  flagged?: boolean;
  flag_reason?: string | null;
}

export interface LineItemExtracted extends LineItemDraft {
  flagged?: boolean;
  flag_reason?: string | null;
}

export interface LineItemDraftWithFlags extends LineItemDraft {
  flagged?: boolean;
  flagReason?: string | null;
  priceStatus?: PriceStatus;
}

export type PlacementConfidence = "high" | "medium" | "low";
export type UnresolvedSegmentSource =
  | "leftover_classification"
  | "typed_conflict"
  | "transcript_conflict";

export interface PricingHints {
  explicit_total: number | null;
  deposit_amount: number | null;
  tax_rate: number | null;
  discount_type: DiscountType | null;
  discount_value: number | null;
}

export interface ExtractionSuggestion {
  text: string;
  confidence: PlacementConfidence;
  source: UnresolvedSegmentSource;
}

export interface ExtractionResult {
  transcript: string;
  line_items: LineItemExtracted[];
  pricing_hints: PricingHints;
  customer_notes_suggestion: ExtractionSuggestion | null;
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
  price_status?: PriceStatus;
  flagged?: boolean;
  flag_reason?: string | null;
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
  extraction_review_metadata?: ExtractionReviewMetadata;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  requires_customer_assignment?: boolean;
  can_reassign_customer?: boolean;
  linked_invoice: LinkedInvoiceSummary | null;
  pdf_artifact: PdfArtifact;
}

export interface ExtractionReviewState {
  notes_pending: boolean;
  pricing_pending: boolean;
}

export interface NotesSeededFieldMetadata {
  seeded: boolean;
  confidence: PlacementConfidence | null;
  source: "explicit_notes_section" | "derived" | "leftover_classification" | null;
}

export interface PricingSeededFieldMetadata {
  seeded: boolean;
  source: "explicit_pricing_phrase" | null;
}

export interface ExtractionReviewHiddenDetails {
  items: Array<{
    id: string;
    kind: "unresolved_segment";
    field?: "notes" | "explicit_total" | "deposit_amount" | "tax_rate" | "discount" | null;
    reason?: string | null;
    text: string;
  }>;
}

export interface HiddenItemState {
  dismissed: boolean;
}

export interface ExtractionReviewMetadata {
  pipeline_version: "v2" | "v2.5";
  review_state: ExtractionReviewState;
  seeded_fields: {
    notes: NotesSeededFieldMetadata;
    pricing: {
      explicit_total: PricingSeededFieldMetadata;
      deposit_amount: PricingSeededFieldMetadata;
      tax_rate: PricingSeededFieldMetadata;
      discount: PricingSeededFieldMetadata;
    };
  };
  hidden_details: ExtractionReviewHiddenDetails;
  hidden_detail_state: Record<string, HiddenItemState>;
  extraction_degraded_reason_code: string | null;
}

export interface ExtractionReviewMetadataUpdateRequest {
  dismiss_hidden_item?: string;
  clear_review_state?: {
    notes_pending?: true;
    pricing_pending?: true;
  };
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
