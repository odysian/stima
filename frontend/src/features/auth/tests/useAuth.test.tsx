import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/features/auth/hooks/useAuth";
import {
  clearOfflineUserSnapshot,
  readOfflineUserSnapshot,
  writeOfflineUserSnapshot,
} from "@/features/auth/offline/offlineUserSnapshot";
import { authService } from "@/features/auth/services/authService";
import { AUTH_SESSION_EXPIRED_FLASH_KEY } from "@/features/auth/sessionFlash";
import { clearDraftsForUser, deleteStaleLocalDrafts } from "@/features/quotes/offline/draftRepository";
import { runOutboxPass } from "@/features/quotes/offline/outboxEngine";
import { AUTH_FAILURE_EVENT, HttpRequestError, hydrateCsrfTokenFromCookie } from "@/shared/lib/http";

vi.mock("@/features/auth/services/authService", () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}));

vi.mock("@/features/quotes/offline/draftRepository", () => ({
  clearDraftsForUser: vi.fn(),
  deleteStaleLocalDrafts: vi.fn(),
}));

vi.mock("@/features/auth/offline/offlineUserSnapshot", () => ({
  clearOfflineUserSnapshot: vi.fn(),
  readOfflineUserSnapshot: vi.fn(),
  writeOfflineUserSnapshot: vi.fn(),
}));

vi.mock("@/features/quotes/offline/outboxEngine", () => ({
  runOutboxPass: vi.fn(),
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
const mockedClearDraftsForUser = vi.mocked(clearDraftsForUser);
const mockedDeleteStaleLocalDrafts = vi.mocked(deleteStaleLocalDrafts);
const mockedReadOfflineUserSnapshot = vi.mocked(readOfflineUserSnapshot);
const mockedWriteOfflineUserSnapshot = vi.mocked(writeOfflineUserSnapshot);
const mockedClearOfflineUserSnapshot = vi.mocked(clearOfflineUserSnapshot);
const mockedRunOutboxPass = vi.mocked(runOutboxPass);
const ORIGINAL_NAVIGATOR_ONLINE_DESCRIPTOR = Object.getOwnPropertyDescriptor(window.navigator, "onLine");

function AuthHarness(): React.ReactElement {
  const { authMode, user, refreshUser, register, logout } = useAuth();

  return (
    <div>
      <p data-testid="auth-state">{user ? user.email : "none"}</p>
      <p data-testid="auth-mode">{authMode}</p>
      <p data-testid="auth-user-id">{user?.id ?? "none"}</p>
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
      <button type="button" onClick={() => void refreshUser()}>
        Refresh
      </button>
      <button type="button" onClick={() => void logout()}>
        Logout
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mockedClearDraftsForUser.mockResolvedValue(undefined);
  mockedDeleteStaleLocalDrafts.mockResolvedValue(undefined);
  mockedReadOfflineUserSnapshot.mockReturnValue(null);
  mockedRunOutboxPass.mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: true,
  });
});

afterEach(() => {
  window.sessionStorage.clear();
  if (ORIGINAL_NAVIGATOR_ONLINE_DESCRIPTOR) {
    Object.defineProperty(window.navigator, "onLine", ORIGINAL_NAVIGATOR_ONLINE_DESCRIPTOR);
    return;
  }
  delete (window.navigator as { onLine?: boolean }).onLine;
});

describe("useAuth", () => {
  it("hydrates CSRF on bootstrap, loads user, and prunes stale drafts", async () => {
    mockedAuthService.me.mockResolvedValueOnce({
      id: "user-1",
      email: "user@example.com",
      is_active: true,
      is_onboarded: true,
      timezone: "America/New_York",
    });

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
    expect(mockedHydrateCsrf).toHaveBeenCalledTimes(1);
    expect(mockedDeleteStaleLocalDrafts).toHaveBeenCalledWith("user-1", 7);
    expect(mockedWriteOfflineUserSnapshot).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("auth-mode")).toHaveTextContent("verified");
  });

  it("registers, logs in, prunes stale drafts, and clears drafts on logout", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new Error("Not authenticated"));
    mockedAuthService.register.mockResolvedValueOnce();
    mockedAuthService.login.mockResolvedValueOnce();
    mockedAuthService.me.mockResolvedValueOnce({
      id: "user-2",
      email: "new@example.com",
      is_active: true,
      is_onboarded: false,
      timezone: null,
    });
    mockedAuthService.logout.mockResolvedValueOnce();

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("none");
    });

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
    expect(mockedDeleteStaleLocalDrafts).toHaveBeenCalledWith("user-2", 7);

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => {
      expect(mockedAuthService.logout).toHaveBeenCalledTimes(1);
      expect(mockedClearDraftsForUser).toHaveBeenCalledWith("user-2");
      expect(mockedClearOfflineUserSnapshot).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("auth-state")).toHaveTextContent("none");
      expect(screen.getByTestId("auth-mode")).toHaveTextContent("signed_out");
    });
  });

  it("clears snapshot and stays signed out on explicit auth failure", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new HttpRequestError("Unauthorized", 401, null));
    mockedReadOfflineUserSnapshot.mockReturnValue({
      userId: "user-stale",
      isOnboarded: true,
      timezone: "UTC",
      lastVerifiedAt: new Date().toISOString(),
    });

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("none");
    });
    expect(screen.getByTestId("auth-mode")).toHaveTextContent("signed_out");
    expect(mockedClearOfflineUserSnapshot).toHaveBeenCalledTimes(1);
    expect(mockedReadOfflineUserSnapshot).not.toHaveBeenCalled();
  });

  it("treats missing access-token errors as explicit auth failures", async () => {
    mockedAuthService.me.mockRejectedValueOnce(
      new HttpRequestError("Missing access token", 400, { detail: "Missing access token" }),
    );
    mockedReadOfflineUserSnapshot.mockReturnValue({
      userId: "user-stale",
      isOnboarded: true,
      timezone: "UTC",
      lastVerifiedAt: new Date().toISOString(),
    });

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("none");
    });
    expect(screen.getByTestId("auth-mode")).toHaveTextContent("signed_out");
    expect(mockedClearOfflineUserSnapshot).toHaveBeenCalledTimes(1);
    expect(mockedReadOfflineUserSnapshot).not.toHaveBeenCalled();
  });

  it("restores offline snapshot for failed-fetch bootstrap failures", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    mockedReadOfflineUserSnapshot.mockReturnValue({
      userId: "user-offline",
      isOnboarded: true,
      timezone: "America/New_York",
      lastVerifiedAt: new Date().toISOString(),
    });

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-mode")).toHaveTextContent("offline_recovered");
      expect(screen.getByTestId("auth-user-id")).toHaveTextContent("user-offline");
    });
  });

  it("does not restore snapshot for unrelated TypeError failures", async () => {
    mockedAuthService.me.mockRejectedValueOnce(new TypeError("Something unexpected happened"));
    mockedReadOfflineUserSnapshot.mockReturnValue({
      userId: "user-offline",
      isOnboarded: true,
      timezone: "America/New_York",
      lastVerifiedAt: new Date().toISOString(),
    });

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("none");
    });
    expect(screen.getByTestId("auth-mode")).toHaveTextContent("signed_out");
    expect(mockedReadOfflineUserSnapshot).not.toHaveBeenCalled();
  });

  it("does not restore snapshot for AbortError failures", async () => {
    const abortError = new TypeError("Request was aborted");
    abortError.name = "AbortError";
    mockedAuthService.me.mockRejectedValueOnce(abortError);
    mockedReadOfflineUserSnapshot.mockReturnValue({
      userId: "user-offline",
      isOnboarded: true,
      timezone: "America/New_York",
      lastVerifiedAt: new Date().toISOString(),
    });

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("none");
    });
    expect(screen.getByTestId("auth-mode")).toHaveTextContent("signed_out");
    expect(mockedReadOfflineUserSnapshot).not.toHaveBeenCalled();
  });

  it("reverifies on online event from offline_recovered and unpauses auth-required jobs", async () => {
    mockedAuthService.me
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        id: "user-9",
        email: "user9@example.com",
        is_active: true,
        is_onboarded: true,
        timezone: "America/New_York",
      });
    mockedReadOfflineUserSnapshot.mockReturnValue({
      userId: "user-9",
      isOnboarded: true,
      timezone: "America/New_York",
      lastVerifiedAt: new Date().toISOString(),
    });

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-mode")).toHaveTextContent("offline_recovered");
    });

    window.dispatchEvent(new Event("online"));

    await waitFor(() => {
      expect(screen.getByTestId("auth-mode")).toHaveTextContent("verified");
      expect(screen.getByTestId("auth-state")).toHaveTextContent("user9@example.com");
      expect(mockedRunOutboxPass).toHaveBeenCalledWith("user-9", { forceAfterAuth: true });
    });
  });

  it("deduplicates rapid online events while offline_recovered reverify is in flight", async () => {
    let resolveReverify: ((value: {
      id: string;
      email: string;
      is_active: boolean;
      is_onboarded: boolean;
      timezone: string;
    }) => void) | undefined;
    const pendingReverify = new Promise<{
      id: string;
      email: string;
      is_active: boolean;
      is_onboarded: boolean;
      timezone: string;
    }>((resolve) => {
      resolveReverify = resolve;
    });

    mockedAuthService.me
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockReturnValueOnce(pendingReverify);
    mockedReadOfflineUserSnapshot.mockReturnValue({
      userId: "user-9",
      isOnboarded: true,
      timezone: "America/New_York",
      lastVerifiedAt: new Date().toISOString(),
    });

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-mode")).toHaveTextContent("offline_recovered");
    });

    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));

    await waitFor(() => {
      expect(mockedAuthService.me).toHaveBeenCalledTimes(2);
    });

    resolveReverify?.({
      id: "user-9",
      email: "user9@example.com",
      is_active: true,
      is_onboarded: true,
      timezone: "America/New_York",
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-mode")).toHaveTextContent("verified");
      expect(mockedRunOutboxPass).toHaveBeenCalledWith("user-9", { forceAfterAuth: true });
    });
  });

  it("forces signed_out when explicit auth-failure event is broadcast", async () => {
    mockedAuthService.me.mockResolvedValueOnce({
      id: "user-1",
      email: "user@example.com",
      is_active: true,
      is_onboarded: true,
      timezone: "America/New_York",
    });

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByTestId("auth-mode")).toHaveTextContent("verified");

    act(() => {
      window.dispatchEvent(new CustomEvent(AUTH_FAILURE_EVENT));
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("none");
      expect(screen.getByTestId("auth-mode")).toHaveTextContent("signed_out");
    });
    expect(window.sessionStorage.getItem(AUTH_SESSION_EXPIRED_FLASH_KEY)).toBe("1");
    expect(mockedClearOfflineUserSnapshot).toHaveBeenCalled();
  });

  it("does not set session-expired flash key on manual logout", async () => {
    mockedAuthService.me.mockResolvedValueOnce({
      id: "user-2",
      email: "user@example.com",
      is_active: true,
      is_onboarded: true,
      timezone: "America/New_York",
    });
    mockedAuthService.logout.mockResolvedValueOnce();

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => {
      expect(screen.getByTestId("auth-mode")).toHaveTextContent("signed_out");
    });
    expect(window.sessionStorage.getItem(AUTH_SESSION_EXPIRED_FLASH_KEY)).toBeNull();
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
