import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/features/auth/components/LoginForm";
import { AuthProvider } from "@/features/auth/hooks/useAuth";
import { authService } from "@/features/auth/services/authService";
import {
  AUTH_SESSION_EXPIRED_FLASH_KEY,
  AUTH_SESSION_EXPIRED_FLASH_MESSAGE,
} from "@/features/auth/sessionFlash";
import { clearCsrfToken } from "@/shared/lib/http";
import { ToastProvider } from "@/ui/Toast";

vi.mock("@/features/auth/services/authService", () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}));

const mockedAuthService = vi.mocked(authService);

function DashboardProbe(): React.ReactElement {
  const location = useLocation();
  return <div>{`Dashboard${location.search}`}</div>;
}

function renderLogin(initialEntry: string | { pathname: string; state?: unknown } = "/login") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginForm />} />
            <Route path="/" element={<div>Home</div>} />
            <Route path="/dashboard" element={<DashboardProbe />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
  clearCsrfToken();
  window.sessionStorage.clear();
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
      timezone: "America/New_York",
    });

    renderLogin();
    expect(await screen.findByRole("main")).toHaveClass("screen-radial-backdrop");

    fireEvent.change(await screen.findByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(await screen.findByLabelText(/^password$/i), {
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
      timezone: "America/New_York",
    });

    renderLogin({
      pathname: "/login",
      state: { from: { pathname: "/dashboard" } },
    });
    expect(await screen.findByRole("main")).toHaveClass("screen-radial-backdrop");

    fireEvent.change(await screen.findByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(await screen.findByLabelText(/^password$/i), {
      target: { value: "super-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
  });

  it("preserves query params when redirecting to state.from", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));
    mockedAuthService.login.mockResolvedValueOnce();
    mockedAuthService.me.mockResolvedValueOnce({
      id: "user-2",
      email: "user@example.com",
      is_active: true,
      is_onboarded: true,
      timezone: "America/New_York",
    });

    renderLogin({
      pathname: "/login",
      state: { from: { pathname: "/dashboard", search: "?tab=drafts" } },
    });

    fireEvent.change(await screen.findByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(await screen.findByLabelText(/^password$/i), {
      target: { value: "super-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Dashboard?tab=drafts")).toBeInTheDocument();
  });

  it("renders an alert when login fails", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));
    mockedAuthService.login.mockRejectedValueOnce(new Error("Invalid credentials"));

    renderLogin();
    expect(await screen.findByRole("main")).toHaveClass("screen-radial-backdrop");

    fireEvent.change(await screen.findByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(await screen.findByLabelText(/^password$/i), {
      target: { value: "bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid credentials");
  });

  it("shows forgot-password link", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));

    renderLogin();

    const forgotPasswordLink = await screen.findByRole("link", { name: /forgot password\?/i });
    expect(forgotPasswordLink).toHaveAttribute("href", "/forgot-password");
  });

  it("renders a success toast when flashMessage exists in location state", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));

    renderLogin({
      pathname: "/login",
      state: { flashMessage: "Password reset successful. Please sign in." },
    });

    expect(
      await screen.findByText("Password reset successful. Please sign in."),
    ).toBeInTheDocument();
  });

  it("shows inline session-expired banner when auth-failure flash key is present", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));
    window.sessionStorage.setItem(AUTH_SESSION_EXPIRED_FLASH_KEY, "1");

    renderLogin();

    expect(await screen.findByText(AUTH_SESSION_EXPIRED_FLASH_MESSAGE)).toBeInTheDocument();
  });

  it("clears session-expired flash key after showing the inline banner", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));
    window.sessionStorage.setItem(AUTH_SESSION_EXPIRED_FLASH_KEY, "1");

    renderLogin();

    await screen.findByText(AUTH_SESSION_EXPIRED_FLASH_MESSAGE);
    expect(window.sessionStorage.getItem(AUTH_SESSION_EXPIRED_FLASH_KEY)).toBeNull();
  });

  it("does not show session-expired banner for manual navigation to login", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));

    renderLogin();

    await screen.findByRole("main");
    expect(screen.queryByText(AUTH_SESSION_EXPIRED_FLASH_MESSAGE)).not.toBeInTheDocument();
  });

  it("keeps flashMessage toast behavior when session-expired banner also exists", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));
    window.sessionStorage.setItem(AUTH_SESSION_EXPIRED_FLASH_KEY, "1");

    renderLogin({
      pathname: "/login",
      state: { flashMessage: "Password reset successful. Please sign in." },
    });

    expect(await screen.findByText(AUTH_SESSION_EXPIRED_FLASH_MESSAGE)).toBeInTheDocument();
    expect(
      await screen.findByText("Password reset successful. Please sign in."),
    ).toBeInTheDocument();
  });

  it("toggles password visibility with accessible button state", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));

    renderLogin();

    const passwordInput = await screen.findByLabelText(/^password$/i);
    const showToggle = screen.getByRole("button", { name: /show password/i });

    expect(passwordInput).toHaveAttribute("type", "password");
    expect(showToggle).toHaveAttribute("type", "button");
    expect(showToggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(showToggle);

    expect(passwordInput).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: /hide password/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
