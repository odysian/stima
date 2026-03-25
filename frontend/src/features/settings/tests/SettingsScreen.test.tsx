import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { getTimezoneOptions } from "@/features/profile/lib/timezones";
import { profileService } from "@/features/profile/services/profileService";
import {
  TRADE_TYPES,
  type ProfileResponse,
} from "@/features/profile/types/profile.types";
import { SettingsScreen } from "@/features/settings/components/SettingsScreen";

vi.mock("@/features/auth/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/profile/services/profileService", () => ({
  profileService: {
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
  },
}));

vi.mock("@/features/profile/lib/timezones", () => ({
  getTimezoneOptions: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedProfileService = vi.mocked(profileService);
const mockedGetTimezoneOptions = vi.mocked(getTimezoneOptions);

function makeProfileResponse(overrides: Partial<ProfileResponse> = {}): ProfileResponse {
  return {
    id: "user-1",
    email: "test@example.com",
    is_active: true,
    is_onboarded: true,
    business_name: "Summit Exterior Care",
    first_name: "Alex",
    last_name: "Stone",
    trade_type: "Landscaper",
    timezone: "America/New_York",
    ...overrides,
  };
}

function renderScreen(): void {
  render(
    <MemoryRouter>
      <SettingsScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedUseAuth.mockReturnValue({
    user: {
      id: "user-1",
      email: "test@example.com",
      is_active: true,
      is_onboarded: true,
      timezone: "America/New_York",
    },
    isLoading: false,
    isOnboarded: true,
    refreshUser: vi.fn(async () => undefined),
    login: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
  });
  mockedGetTimezoneOptions.mockImplementation((selectedTimezone?: string | null) => {
    if (!selectedTimezone) {
      return ["America/New_York", "UTC"];
    }

    return selectedTimezone === "UTC" ? ["UTC"] : [selectedTimezone, "UTC"];
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("SettingsScreen", () => {
  it("renders pre-filled form fields, trade selector, and read-only account email", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(
      makeProfileResponse({
        email: "owner@example.com",
        business_name: "Bright Lawn Care",
        first_name: "Jordan",
        last_name: "Hill",
        trade_type: "Plumber",
      }),
    );

    renderScreen();

    expect(await screen.findByDisplayValue("Bright Lawn Care")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Jordan")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Hill")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: new RegExp(TRADE_TYPES.join("|"), "i") })).toHaveLength(
      TRADE_TYPES.length,
    );
    expect(screen.getByRole("button", { name: "Plumber" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/timezone/i)).toHaveValue("America/New_York");
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("normalizes null profile values before binding to controlled inputs", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedProfileService.getProfile.mockResolvedValueOnce(
      makeProfileResponse({
        business_name: null,
        first_name: null,
        last_name: null,
        trade_type: null,
        timezone: null,
      }),
    );

    renderScreen();

    await screen.findByLabelText(/business name/i);

    expect((screen.getByLabelText(/business name/i) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/last name/i) as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: TRADE_TYPES[0] })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/timezone/i)).toHaveValue("UTC");

    const errorOutput = consoleErrorSpy.mock.calls.flat().join(" ");
    expect(errorOutput).not.toContain("A component is changing an uncontrolled input");
    expect(errorOutput).not.toContain("A component is changing a controlled input");

    consoleErrorSpy.mockRestore();
  });

  it("submits profile updates, refreshes auth user, and shows inline success feedback", async () => {
    const refreshUser = vi.fn(async () => undefined);
    mockedUseAuth.mockReturnValue({
      user: {
        id: "user-1",
        email: "test@example.com",
        is_active: true,
        is_onboarded: true,
        timezone: "America/New_York",
      },
      isLoading: false,
      isOnboarded: true,
      refreshUser,
      login: vi.fn(async () => undefined),
      register: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    });
    mockedProfileService.getProfile.mockResolvedValueOnce(makeProfileResponse());
    mockedProfileService.updateProfile.mockResolvedValueOnce(
      makeProfileResponse({ trade_type: "Builder" }),
    );

    renderScreen();

    await screen.findByLabelText(/business name/i);

    fireEvent.change(screen.getByLabelText(/business name/i), {
      target: { value: "North Star Lawn" },
    });
    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: "Jamie" },
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: "Reed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Builder" }));
    fireEvent.change(screen.getByLabelText(/timezone/i), {
      target: { value: "UTC" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedProfileService.updateProfile).toHaveBeenCalledWith({
        business_name: "North Star Lawn",
        first_name: "Jamie",
        last_name: "Reed",
        trade_type: "Builder",
        timezone: "UTC",
      });
    });
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("keeps save success when refreshUser fails after successful profile update", async () => {
    const refreshUser = vi.fn(async () => {
      throw new Error("Unable to refresh user");
    });
    mockedUseAuth.mockReturnValue({
      user: {
        id: "user-1",
        email: "test@example.com",
        is_active: true,
        is_onboarded: true,
        timezone: "America/New_York",
      },
      isLoading: false,
      isOnboarded: true,
      refreshUser,
      login: vi.fn(async () => undefined),
      register: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    });
    mockedProfileService.getProfile.mockResolvedValueOnce(makeProfileResponse());
    mockedProfileService.updateProfile.mockResolvedValueOnce(makeProfileResponse());

    renderScreen();

    await screen.findByLabelText(/business name/i);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(mockedProfileService.updateProfile).toHaveBeenCalledTimes(1));
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.queryByText("Unable to save settings")).not.toBeInTheDocument();
  });

  it("shows inline save error when profile update fails", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(makeProfileResponse());
    mockedProfileService.updateProfile.mockRejectedValueOnce(new Error("Unable to save settings"));

    renderScreen();

    await screen.findByLabelText(/business name/i);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save settings");
  });

  it("disables submit button while profile update is in-flight", async () => {
    let resolveUpdate: ((value: ProfileResponse) => void) | undefined;
    mockedProfileService.getProfile.mockResolvedValueOnce(makeProfileResponse());
    mockedProfileService.updateProfile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );

    renderScreen();

    await screen.findByLabelText(/business name/i);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    const submitButton = screen.getByRole("button", { name: /loading/i });
    expect(submitButton).toBeDisabled();

    resolveUpdate?.(makeProfileResponse());
    await waitFor(() => expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled());
  });

  it("calls logout when sign out is clicked", async () => {
    const logout = vi.fn(async () => undefined);
    mockedUseAuth.mockReturnValue({
      user: {
        id: "user-1",
        email: "test@example.com",
        is_active: true,
        is_onboarded: true,
        timezone: "America/New_York",
      },
      isLoading: false,
      isOnboarded: true,
      refreshUser: vi.fn(async () => undefined),
      login: vi.fn(async () => undefined),
      register: vi.fn(async () => undefined),
      logout,
    });
    mockedProfileService.getProfile.mockResolvedValueOnce(makeProfileResponse());

    renderScreen();

    const signOutButton = await screen.findByRole("button", { name: /sign out/i });
    expect(signOutButton).toHaveClass("bg-secondary", "text-white");
    expect(signOutButton).not.toHaveClass("border");

    fireEvent.click(signOutButton);

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });

  it("shows a loading state while profile fetch is in-flight and does not render the form", async () => {
    let resolveProfile: ((value: ProfileResponse) => void) | undefined;
    mockedProfileService.getProfile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveProfile = resolve;
        }),
    );

    renderScreen();

    expect(screen.getByRole("status")).toHaveTextContent("Loading settings...");
    expect(screen.queryByLabelText(/business name/i)).not.toBeInTheDocument();

    resolveProfile?.(makeProfileResponse());
    expect(await screen.findByLabelText(/business name/i)).toBeInTheDocument();
  });

  it("shows an error state when profile fetch fails and does not render the form", async () => {
    mockedProfileService.getProfile.mockRejectedValueOnce(new Error("Unable to load settings"));

    renderScreen();

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load settings");
    expect(screen.queryByLabelText(/business name/i)).not.toBeInTheDocument();
  });
});
