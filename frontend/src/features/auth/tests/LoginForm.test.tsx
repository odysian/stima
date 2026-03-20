import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/features/auth/components/LoginForm";
import { AuthProvider } from "@/features/auth/hooks/useAuth";
import { authService } from "@/features/auth/services/authService";
import { clearCsrfToken } from "@/shared/lib/http";

vi.mock("@/features/auth/services/authService", () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}));

const mockedAuthService = vi.mocked(authService);

function renderLogin(initialEntry: string | { pathname: string; state?: unknown } = "/login") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginForm />} />
          <Route path="/" element={<div>Home</div>} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
  clearCsrfToken();
});

describe("LoginForm", () => {
  it("submits credentials and redirects to root when no from state is present", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));
    mockedAuthService.login.mockResolvedValueOnce();
    mockedAuthService.me.mockResolvedValueOnce({
      id: "user-1",
      email: "user@example.com",
      is_active: true,
      is_onboarded: true,
    });

    renderLogin();

    fireEvent.change(await screen.findByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(await screen.findByLabelText(/password/i), {
      target: { value: "super-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockedAuthService.login).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "super-secret",
      });
    });

    expect(await screen.findByText("Home")).toBeInTheDocument();
  });

  it("redirects to state.from when provided", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));
    mockedAuthService.login.mockResolvedValueOnce();
    mockedAuthService.me.mockResolvedValueOnce({
      id: "user-2",
      email: "user@example.com",
      is_active: true,
      is_onboarded: true,
    });

    renderLogin({
      pathname: "/login",
      state: { from: { pathname: "/dashboard" } },
    });

    fireEvent.change(await screen.findByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(await screen.findByLabelText(/password/i), {
      target: { value: "super-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
  });

  it("renders an alert when login fails", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));
    mockedAuthService.login.mockRejectedValueOnce(new Error("Invalid credentials"));

    renderLogin();

    fireEvent.change(await screen.findByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(await screen.findByLabelText(/password/i), {
      target: { value: "bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid credentials");
  });
});
