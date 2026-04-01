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
  business_name: string | null;
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
  timezone?: string | null;
  default_tax_rate?: number | null;
}
