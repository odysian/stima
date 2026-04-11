import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResetPasswordPage } from "@/features/auth/components/ResetPasswordPage";
import { authService } from "@/features/auth/services/authService";
import { HttpRequestError } from "@/shared/lib/http";

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

function renderResetPassword(initialEntry = "/reset-password?token=token-123") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<LoginFlashProbe />} />
        <Route path="/forgot-password" element={<div>Forgot Password Route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ResetPasswordPage", () => {
  it("submits token and new password then redirects to login with success message", async () => {
    mockedAuthService.resetPassword.mockResolvedValueOnce();

    renderResetPassword();

    fireEvent.change(await screen.findByLabelText(/new password/i), {
      target: { value: "NewStrongPass123!" },
    });
    fireEvent.change(await screen.findByLabelText(/confirm password/i), {
      target: { value: "NewStrongPass123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(mockedAuthService.resetPassword).toHaveBeenCalledWith(
        "token-123",
        "NewStrongPass123!",
      );
    });

    expect(await screen.findByText("Password reset successful. Please sign in.")).toBeInTheDocument();
  });

  it("shows invalid-token state and forgot-password link when reset token is rejected", async () => {
    mockedAuthService.resetPassword.mockRejectedValueOnce(
      new HttpRequestError("Invalid or expired token", 400, {
        detail: "Invalid or expired token",
      }),
    );

    renderResetPassword();

    fireEvent.change(await screen.findByLabelText(/new password/i), {
      target: { value: "NewStrongPass123!" },
    });
    fireEvent.change(await screen.findByLabelText(/confirm password/i), {
      target: { value: "NewStrongPass123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    expect(
      await screen.findByText("This reset link is invalid or expired. Request a new reset link."),
    ).toBeInTheDocument();

    const forgotPasswordLink = screen.getByRole("link", { name: /back to forgot password/i });
    expect(forgotPasswordLink).toHaveAttribute("href", "/forgot-password");
  });
});