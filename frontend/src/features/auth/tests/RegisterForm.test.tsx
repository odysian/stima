import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RegisterForm } from "@/features/auth/components/RegisterForm";
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

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={["/register"]}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<RegisterForm />} />
          <Route path="/onboarding" element={<div>Onboarding Route</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
  clearCsrfToken();
});

describe("RegisterForm", () => {
  it("submits credentials and redirects to onboarding", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));
    mockedAuthService.register.mockResolvedValueOnce();
    mockedAuthService.login.mockResolvedValueOnce();
    mockedAuthService.me.mockResolvedValueOnce({
      id: "user-1",
      email: "new@example.com",
      is_active: true,
    });

    renderRegister();

    fireEvent.change(await screen.findByLabelText(/email/i), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(await screen.findByLabelText(/password/i), {
      target: { value: "strong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(mockedAuthService.register).toHaveBeenCalledWith({
        email: "new@example.com",
        password: "strong-password",
      });
    });
    expect(mockedAuthService.login).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "strong-password",
    });

    expect(await screen.findByText("Onboarding Route")).toBeInTheDocument();
  });

  it("renders an alert when registration fails", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));
    mockedAuthService.register.mockRejectedValueOnce(new Error("Email already exists"));

    renderRegister();

    fireEvent.change(await screen.findByLabelText(/email/i), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(await screen.findByLabelText(/password/i), {
      target: { value: "weak" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email already exists");
  });
});
