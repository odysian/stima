export interface User {
  id: string;
  email: string;
  is_active: boolean;
  is_onboarded: boolean;
  timezone: string | null;
}

export type AuthMode = "verified" | "offline_recovered" | "signed_out";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  csrf_token: string;
}

export interface RegisterResponse {
  user: User;
}
