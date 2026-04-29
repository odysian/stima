export const TRADE_TYPES = [
  "Plumber",
  "Electrician",
  "Builder",
  "Painter",
  "Landscaper",
  "Other",
] as const;

export type TradeType = (typeof TRADE_TYPES)[number];

export interface ProfileResponse {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  business_name: string | null;
  business_address_line1: string | null;
  business_address_line2: string | null;
  business_city: string | null;
  business_state: string | null;
  business_postal_code: string | null;
  trade_type: TradeType | null;
  timezone: string | null;
  default_tax_rate: number | null;
  has_logo: boolean;
  is_active: boolean;
  is_onboarded: boolean;
}

export interface ProfileUpdateRequest {
  business_name: string;
  first_name: string;
  last_name: string;
  trade_type: TradeType;
  phone_number?: string | null;
  business_address_line1?: string | null;
  business_address_line2?: string | null;
  business_city?: string | null;
  business_state?: string | null;
  business_postal_code?: string | null;
  timezone?: string | null;
  default_tax_rate?: number | null;
}
