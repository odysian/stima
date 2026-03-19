import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/features/auth/hooks/useAuth";
import { authService } from "@/features/auth/services/authService";
import { hydrateCsrfTokenFromCookie } from "@/shared/lib/http";

vi.mock("@/features/auth/services/authService", () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}));

vi.mock("@/shared/lib/http", async () => {
  const actual = await vi.importActual<typeof import("@/shared/lib/http")>("@/shared/lib/http");

  return {
    ...actual,
    hydrateCsrfTokenFromCookie: vi.fn(),
  };
});

const mockedAuthService = vi.mocked(authService);
const mockedHydrateCsrf = vi.mocked(hydrateCsrfTokenFromCookie);

function AuthHarness(): React.ReactElement {
  const { user, register, logout } = useAuth();

  return (
    <div>
      <p data-testid="auth-state">{user ? user.email : "none"}</p>
      <button
        type="button"
        onClick={() =>
          void register({
            email: "new@example.com",
            password: "strong-password",
          })
        }
      >
        Register
      </button>
      <button type="button" onClick={() => void logout()}>
        Logout
      </button>
    </div>
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useAuth", () => {
  it("hydrates CSRF on bootstrap and loads user when session exists", async () => {
    mockedAuthService.me.mockResolvedValueOnce({
      id: "user-1",
      email: "user@example.com",
      is_active: true,
    });

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
    expect(mockedHydrateCsrf).toHaveBeenCalledTimes(1);
  });

  it("registers, logs in, and then logs out", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));
    mockedAuthService.register.mockResolvedValueOnce();
    mockedAuthService.login.mockResolvedValueOnce();
    mockedAuthService.me.mockResolvedValueOnce({
      id: "user-2",
      email: "new@example.com",
      is_active: true,
    });
    mockedAuthService.logout.mockResolvedValueOnce();

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await screen.findByText("none");

    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByText("new@example.com")).toBeInTheDocument();
    expect(mockedAuthService.register).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "strong-password",
    });
    expect(mockedAuthService.login).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "strong-password",
    });
    expect(mockedAuthService.register.mock.invocationCallOrder[0]).toBeLessThan(
      mockedAuthService.login.mock.invocationCallOrder[0],
    );

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => {
      expect(mockedAuthService.logout).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("auth-state")).toHaveTextContent("none");
    });
  });

  it("throws when used outside AuthProvider", () => {
    function OutsideProviderHarness(): React.ReactElement {
      useAuth();

      return <div>Outside</div>;
    }

    expect(() => render(<OutsideProviderHarness />)).toThrow(
      "useAuth must be used within an AuthProvider",
    );
  });
});
