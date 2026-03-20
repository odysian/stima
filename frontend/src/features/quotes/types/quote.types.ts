export interface LineItemDraft {
  description: string;
  details: string | null;
  price: number | null;
}

export interface ExtractionResult {
  transcript: string;
  line_items: LineItemDraft[];
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

export type QuoteStatus = "draft" | "ready" | "shared";

export interface Quote {
  id: string;
  customer_id: string;
  doc_number: string;
  status: QuoteStatus;
  source_type: string;
  transcript: string;
  total_amount: number | null;
  notes: string | null;
  line_items: LineItem[];
  created_at: string;
  updated_at: string;
}

export interface QuoteCreateRequest {
  customer_id: string;
  transcript: string;
  line_items: LineItemDraft[];
  total_amount: number | null;
  notes: string;
}

export interface QuoteUpdateRequest {
  line_items?: LineItemDraft[];
  total_amount?: number | null;
  notes?: string | null;
}
