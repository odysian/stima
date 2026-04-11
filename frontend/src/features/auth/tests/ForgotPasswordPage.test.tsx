import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ForgotPasswordPage } from "@/features/auth/components/ForgotPasswordPage";
import { authService } from "@/features/auth/services/authService";

vi.mock("@/features/auth/services/authService", () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

const mockedAuthService = vi.mocked(authService);

function LoginFlashProbe(): React.ReactElement {
  const location = useLocation();
  const flashMessage =
    (location.state as { flashMessage?: string } | undefined)?.flashMessage ?? "";

  return <p>{flashMessage}</p>;
}

function renderForgotPassword() {
  return render(
    <MemoryRouter initialEntries={["/forgot-password"]}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/login" element={<LoginFlashProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ForgotPasswordPage", () => {
  it("submits email and redirects to login with generic success message", async () => {
    mockedAuthService.forgotPassword.mockResolvedValueOnce();

    renderForgotPassword();

    fireEvent.change(await screen.findByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockedAuthService.forgotPassword).toHaveBeenCalledWith("user@example.com");
    });

    expect(
      await screen.findByText("If an account exists with that email, you'll receive a reset link."),
    ).toBeInTheDocument();
  });

  it("renders back-to-login link", async () => {
    renderForgotPassword();

    const link = await screen.findByRole("link", { name: /back to login/i });
    expect(link).toHaveAttribute("href", "/login");
  });
});