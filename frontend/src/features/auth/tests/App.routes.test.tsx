import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import { AuthProvider } from "@/features/auth/hooks/useAuth";
import { authService } from "@/features/auth/services/authService";

vi.mock("@/features/auth/services/authService", () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}));

const mockedAuthService = vi.mocked(authService);

function renderApp(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("App routes", () => {
  it("redirects unauthenticated users from onboarding route to login", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));

    renderApp("/onboarding");

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });

  it("redirects authenticated users away from public routes", async () => {
    mockedAuthService.me.mockResolvedValueOnce({
      id: "user-3",
      email: "user@example.com",
      is_active: true,
      is_onboarded: true,
    });

    renderApp("/login");

    expect(await screen.findByRole("heading", { name: /your quotes/i })).toBeInTheDocument();
  });

  it("redirects authenticated users who are not onboarded to onboarding", async () => {
    mockedAuthService.me.mockResolvedValueOnce({
      id: "user-4",
      email: "user@example.com",
      is_active: true,
      is_onboarded: false,
    });

    renderApp("/");

    expect(await screen.findByRole("heading", { name: /complete your business profile/i })).toBeInTheDocument();
  });

  it("redirects onboarded users away from /onboarding", async () => {
    mockedAuthService.me.mockResolvedValueOnce({
      id: "user-5",
      email: "user@example.com",
      is_active: true,
      is_onboarded: true,
    });

    renderApp("/onboarding");

    expect(await screen.findByRole("heading", { name: /your quotes/i })).toBeInTheDocument();
  });

  it("renders settings screen for onboarded users at /settings", async () => {
    mockedAuthService.me.mockResolvedValueOnce({
      id: "user-6",
      email: "user@example.com",
      is_active: true,
      is_onboarded: true,
    });

    renderApp("/settings");

    expect(await screen.findByRole("heading", { name: /settings/i })).toBeInTheDocument();
    expect(screen.queryByText(/settings coming soon/i)).not.toBeInTheDocument();
  });

  it("redirects unauthenticated users from protected route to login", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));

    renderApp("/");

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });
});
