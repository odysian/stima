export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerCreateRequest {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface CustomerUpdateRequest {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
}
