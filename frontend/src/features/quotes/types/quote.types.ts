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

export interface Quote {
  id: string;
  customer_id: string;
  doc_number: string;
  title: string | null;
  status: QuoteStatus;
  source_type: QuoteSourceType;
  transcript: string;
  total_amount: number | null;
  notes: string | null;
  shared_at: string | null;
  share_token: string | null;
  line_items: LineItem[];
  created_at: string;
  updated_at: string;
}

export interface QuoteDetail extends Quote {
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
}

export interface QuoteListItem {
  id: string;
  customer_id: string;
  customer_name: string;
  doc_number: string;
  title: string | null;
  status: QuoteStatus;
  total_amount: number | null;
  item_count: number;
  created_at: string;
}

export interface QuoteCreateRequest {
  customer_id: string;
  title: string | null;
  transcript: string;
  line_items: LineItemDraft[];
  total_amount: number | null;
  notes: string;
  source_type: QuoteSourceType;
}

export interface QuoteUpdateRequest {
  title?: string | null;
  line_items?: LineItemDraft[];
  total_amount?: number | null;
  notes?: string | null;
}
