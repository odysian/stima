import { render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import { AuthProvider } from "@/features/auth/hooks/useAuth";
import { authService } from "@/features/auth/services/authService";
import { ThemeProvider } from "@/shared/components/ThemeProvider";

vi.mock("@/features/auth/services/authService", () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}));

const mockedAuthService = vi.mocked(authService);

interface RouteLocationState {
  from?: {
    pathname?: string;
  };
}

function LocationProbe(): React.ReactElement {
  const location = useLocation();
  const fromPathname = (location.state as RouteLocationState | undefined)?.from?.pathname ?? "";

  return (
    <>
      <p data-testid="location-pathname">{location.pathname}</p>
      <p data-testid="location-from-pathname">{fromPathname}</p>
    </>
  );
}

function renderApp(path: string): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
          <LocationProbe />
        </AuthProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("App routes", () => {
  it("redirects unauthenticated users from onboarding route to login", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));

    renderApp("/onboarding");

    expect(await screen.findByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
  });

  it("redirects authenticated users away from public routes", async () => {
    mockedAuthService.me.mockResolvedValueOnce({
      id: "user-3",
      email: "user@example.com",
      is_active: true,
      is_onboarded: true,
      timezone: "America/New_York",
    });

    renderApp("/login");

    expect(await screen.findByRole("heading", { name: /^quotes$/i })).toBeInTheDocument();
  });

  it("redirects authenticated users who are not onboarded to onboarding", async () => {
    mockedAuthService.me.mockResolvedValueOnce({
      id: "user-4",
      email: "user@example.com",
      is_active: true,
      is_onboarded: false,
      timezone: null,
    });

    renderApp("/");

    expect(await screen.findByRole("heading", { name: /set up your business/i })).toBeInTheDocument();
  });

  it("redirects onboarded users away from /onboarding", async () => {
    mockedAuthService.me.mockResolvedValueOnce({
      id: "user-5",
      email: "user@example.com",
      is_active: true,
      is_onboarded: true,
      timezone: "America/New_York",
    });

    renderApp("/onboarding");

    expect(await screen.findByRole("heading", { name: /^quotes$/i })).toBeInTheDocument();
  });

  it("renders settings screen for onboarded users at /settings", async () => {
    mockedAuthService.me.mockResolvedValueOnce({
      id: "user-6",
      email: "user@example.com",
      is_active: true,
      is_onboarded: true,
      timezone: "America/New_York",
    });

    renderApp("/settings");

    expect(await screen.findByRole("heading", { name: /settings/i })).toBeInTheDocument();
    expect(screen.queryByText(/settings coming soon/i)).not.toBeInTheDocument();
  });

  it("renders the landing page for unauthenticated users at root", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));

    renderApp("/");

    expect(await screen.findByRole("heading", { name: /capture the job first/i })).toBeInTheDocument();
  });

  it("renders forgot-password for unauthenticated users", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));

    renderApp("/forgot-password");

    expect(await screen.findByRole("heading", { name: /forgot password\?/i })).toBeInTheDocument();
  });

  it("renders reset-password for unauthenticated users", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));

    renderApp("/reset-password?token=sample-token");

    expect(await screen.findByRole("heading", { name: /reset password/i })).toBeInTheDocument();
  });

  it("preserves the protected route in login state so users return after sign-in", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));

    renderApp("/settings");

    expect(await screen.findByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByTestId("location-pathname")).toHaveTextContent("/login");
    expect(screen.getByTestId("location-from-pathname")).toHaveTextContent("/settings");
  });

  it("routes retired quote line-item edit deep links to the default fallback", async () => {
    mockedAuthService.me.mockResolvedValue({
      id: "user-7",
      email: "user@example.com",
      is_active: true,
      is_onboarded: true,
      timezone: "America/New_York",
    });

    renderApp("/quotes/review/line-items/0/edit");
    expect(await screen.findByRole("heading", { name: /^quotes$/i })).toBeInTheDocument();
  });

  it("routes retired persisted quote line-item edit deep links to the default fallback", async () => {
    mockedAuthService.me.mockResolvedValue({
      id: "user-8",
      email: "user@example.com",
      is_active: true,
      is_onboarded: true,
      timezone: "America/New_York",
    });

    renderApp("/quotes/quote-1/edit/line-items/0/edit");
    expect(await screen.findByRole("heading", { name: /^quotes$/i })).toBeInTheDocument();
  });

});
