import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  User,
} from "@/features/auth/types/auth.types";
import { clearCsrfToken, request, setCsrfToken } from "@/shared/lib/http";

interface AuthMessageResponse {
  detail: string;
}

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

async function forgotPassword(email: string): Promise<void> {
  await request<AuthMessageResponse>("/api/auth/forgot-password", {
    method: "POST",
    body: { email },
    skipRefresh: true,
  });
}

async function resetPassword(token: string, newPassword: string): Promise<void> {
  await request<AuthMessageResponse>("/api/auth/reset-password", {
    method: "POST",
    body: {
      token,
      new_password: newPassword,
    },
    skipRefresh: true,
  });
}

export const authService = {
  login,
  register,
  logout,
  me,
  forgotPassword,
  resetPassword,
};
