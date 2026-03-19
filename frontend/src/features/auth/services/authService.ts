import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  User,
} from "@/features/auth/types/auth.types";
import { clearCsrfToken, request, setCsrfToken } from "@/shared/lib/http";

async function login(credentials: LoginRequest): Promise<void> {
  const response = await request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: credentials,
    skipRefresh: true,
  });
  setCsrfToken(response.csrf_token);
}

async function register(credentials: RegisterRequest): Promise<void> {
  await request<RegisterResponse>("/api/auth/register", {
    method: "POST",
    body: credentials,
    skipRefresh: true,
  });
}

async function logout(): Promise<void> {
  await request<void>("/api/auth/logout", {
    method: "POST",
  });
  clearCsrfToken();
}

function me(): Promise<User> {
  return request<User>("/api/auth/me");
}

export const authService = {
  login,
  register,
  logout,
  me,
};
