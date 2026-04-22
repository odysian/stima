import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { ThemeProvider } from "@/shared/components/ThemeProvider";
import { formatByteLimit } from "@/shared/lib/formatters";
import { MAX_LOGO_SIZE_BYTES } from "@/shared/lib/inputLimits";
import { THEME_STORAGE_KEY } from "@/shared/lib/theme";
import { ToastProvider } from "@/ui/Toast";

vi.mock("@/features/auth/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/profile/services/profileService", () => ({
  profileService: {
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    uploadLogo: vi.fn(),
    deleteLogo: vi.fn(),
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
    default_tax_rate: null,
    has_logo: false,
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <ToastProvider>
          <SettingsScreen />
        </ToastProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
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
  window.localStorage.clear();
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
  const logoSizeLimitLabel = formatByteLimit(MAX_LOGO_SIZE_BYTES);

  it("renders the top-level settings shell with grouped fields and inline save", async () => {
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
    expect(screen.getByLabelText(/trade type/i)).toHaveValue("Plumber");
    expect(screen.getByLabelText(/timezone/i)).toHaveValue("America/New_York");
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("Email")).toHaveClass(
      "font-bold",
      "uppercase",
      "tracking-[0.12em]",
      "text-outline",
    );
    expect(screen.getByText("Stima")).toBeInTheDocument();
    expect(
      screen.getByText(`JPEG or PNG, up to ${logoSizeLimitLabel}. Appears on quote PDFs.`),
    ).toBeInTheDocument();
    expect(screen.getByTestId("settings-name-row")).toHaveClass(
      "grid",
      "grid-cols-1",
      "gap-4",
      "min-[360px]:grid-cols-2",
    );
    expect(screen.getByTestId("settings-profile-meta-row")).toHaveClass(
      "grid",
      "grid-cols-1",
      "gap-4",
      "min-[360px]:grid-cols-2",
    );
    expect(screen.getByLabelText(/upload logo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save changes/i }).closest("footer")).toBeNull();
    expect(screen.getByText("Account").closest("div")).toHaveClass("bg-surface-container-low");
    expect(screen.queryByText("Session")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /settings/i })).toHaveClass("text-primary");
    expect(screen.queryByText("Appearance")).not.toBeInTheDocument();
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
    expect(screen.getByLabelText(/trade type/i)).toHaveValue(TRADE_TYPES[0]);
    expect(screen.getByLabelText(/timezone/i)).toHaveValue("UTC");

    const errorOutput = consoleErrorSpy.mock.calls.flat().join(" ");
    expect(errorOutput).not.toContain("A component is changing an uncontrolled input");
    expect(errorOutput).not.toContain("A component is changing a controlled input");

    consoleErrorSpy.mockRestore();
  });

  it("submits profile updates, refreshes auth user, and shows toast success feedback", async () => {
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
    fireEvent.change(screen.getByLabelText(/trade type/i), {
      target: { value: "Builder" },
    });
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
        default_tax_rate: null,
      });
    });
    expect(refreshUser).toHaveBeenCalledTimes(1);
    const savedToast = await screen.findByRole("status");
    expect(savedToast).toHaveTextContent("Saved");
    expect(savedToast).toHaveClass("bg-on-surface");
    expect(savedToast).not.toHaveClass("bg-success-container");
  });

  it("updates the theme preference immediately from the dropdown", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(makeProfileResponse());

    renderScreen();

    await screen.findByLabelText(/business name/i);

    const themeSelect = screen.getByRole("combobox", { name: "Theme" });

    expect(themeSelect).toHaveValue("dark");
    expect(screen.getByRole("option", { name: "System default" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Dark" })).toBeInTheDocument();

    fireEvent.change(themeSelect, { target: { value: "dark" } });

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(themeSelect).toHaveValue("dark");

    fireEvent.change(themeSelect, { target: { value: "light" } });

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(themeSelect).toHaveValue("light");

    fireEvent.change(themeSelect, { target: { value: "system" } });

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(themeSelect).toHaveValue("system");
  });

  it("shows the saved default tax as a percent and persists edited values as fractions", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(
      makeProfileResponse({ default_tax_rate: 0.0825 }),
    );
    mockedProfileService.updateProfile.mockResolvedValueOnce(
      makeProfileResponse({ default_tax_rate: 0.075 }),
    );

    renderScreen();

    expect(await screen.findByDisplayValue("8.25")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/tax rate/i), {
      target: { value: "7.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedProfileService.updateProfile).toHaveBeenCalledWith({
        business_name: "Summit Exterior Care",
        first_name: "Alex",
        last_name: "Stone",
        trade_type: "Landscaper",
        timezone: "America/New_York",
        default_tax_rate: 0.075,
      });
    });
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
    const savedToast = await screen.findByRole("status");
    expect(savedToast).toHaveTextContent("Saved");
    expect(savedToast).toHaveClass("bg-on-surface");
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

    const submitButton = screen.getByRole("button", { name: /save changes/i });
    expect(submitButton).toBeDisabled();
    expect(within(submitButton).getByTestId("button-spinner")).toHaveClass("animate-spin");

    resolveUpdate?.(makeProfileResponse());
    await waitFor(() => expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled());
  });

  it("requires confirmation before signing out", async () => {
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
    expect(signOutButton).toHaveClass("border", "border-secondary", "text-secondary");
    expect(signOutButton).not.toHaveClass("text-on-surface");

    fireEvent.click(signOutButton);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Sign out?")).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByText("Sign out?")).not.toBeInTheDocument());
    expect(logout).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    const confirmDialog = await screen.findByRole("dialog");
    fireEvent.click(within(confirmDialog).getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });

  it("renders logo preview and remove action when profile has a logo", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(
      makeProfileResponse({ has_logo: true }),
    );

    renderScreen();

    expect(await screen.findByText("Business Profile")).toBeInTheDocument();
    expect(screen.getByTestId("settings-logo-block")).toHaveClass(
      "rounded-[var(--radius-document)]",
      "bg-surface-container-low",
      "p-4",
    );
    expect(screen.getByTestId("settings-logo-content-row")).toHaveClass(
      "flex",
      "flex-col",
      "gap-3",
      "min-[360px]:grid",
      "min-[360px]:grid-cols-[128px_minmax(0,1fr)]",
      "min-[360px]:items-start",
      "min-[360px]:gap-4",
    );
    expect(screen.getByTestId("settings-logo-actions")).toHaveClass(
      "flex",
      "min-w-0",
      "flex-col",
      "gap-2",
    );
    const previewTile = await screen.findByTestId("settings-logo-preview-tile");
    expect(previewTile).toHaveClass(
      "h-[128px]",
      "w-[128px]",
      "rounded-[var(--radius-document)]",
      "bg-surface-container-lowest",
    );
    expect(
      screen.getByText(`JPEG or PNG, up to ${logoSizeLimitLabel}. Appears on quote PDFs.`),
    ).toBeInTheDocument();
    expect(await screen.findByAltText(/business logo preview/i)).toHaveClass(
      "max-h-full",
      "max-w-full",
      "object-contain",
    );
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/upload logo/i)).toBeInTheDocument();
    expect(screen.queryByText(/upload new/i)).not.toBeInTheDocument();
  });

  it("renders a fixed no-logo preview frame with the updated upload label", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(makeProfileResponse());

    renderScreen();

    expect(await screen.findByText("Business Profile")).toBeInTheDocument();
    expect(screen.getByTestId("settings-logo-block")).toHaveClass(
      "rounded-[var(--radius-document)]",
      "bg-surface-container-low",
      "p-4",
    );
    expect(screen.getByTestId("settings-logo-content-row")).toHaveClass(
      "flex",
      "flex-col",
      "gap-3",
      "min-[360px]:grid",
      "min-[360px]:grid-cols-[128px_minmax(0,1fr)]",
      "min-[360px]:items-start",
      "min-[360px]:gap-4",
    );
    expect(screen.getByTestId("settings-logo-actions")).toHaveClass(
      "flex",
      "min-w-0",
      "flex-col",
      "gap-2",
    );
    const previewTile = await screen.findByTestId("settings-logo-preview-tile");
    expect(previewTile).toHaveClass(
      "h-[128px]",
      "w-[128px]",
      "rounded-[var(--radius-document)]",
      "bg-surface-container-lowest",
    );
    expect(
      screen.getByText(`JPEG or PNG, up to ${logoSizeLimitLabel}. Appears on quote PDFs.`),
    ).toBeInTheDocument();
    expect(within(previewTile).getByText("No logo")).toBeInTheDocument();
    expect(screen.getByLabelText(/upload logo/i)).toBeInTheDocument();
    expect(screen.queryByText(/upload new/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("uploads a new logo and refreshes the preview state", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(makeProfileResponse());
    mockedProfileService.uploadLogo.mockResolvedValueOnce(
      makeProfileResponse({ has_logo: true }),
    );

    renderScreen();

    const input = (await screen.findByLabelText(/upload logo/i)) as HTMLInputElement;
    const file = new File(["fake-logo"], "logo.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(mockedProfileService.uploadLogo).toHaveBeenCalledWith(file));
    expect(await screen.findByAltText(/business logo preview/i)).toBeInTheDocument();
  });

  it("submits logo uploads when the browser omits file mime metadata", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(makeProfileResponse());
    mockedProfileService.uploadLogo.mockResolvedValueOnce(
      makeProfileResponse({ has_logo: true }),
    );

    renderScreen();

    const input = (await screen.findByLabelText(/upload logo/i)) as HTMLInputElement;
    const file = new File(["fake-logo"], "logo.png");
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(mockedProfileService.uploadLogo).toHaveBeenCalledWith(file));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("submits logo uploads when the browser reports a generic mime type", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(makeProfileResponse());
    mockedProfileService.uploadLogo.mockResolvedValueOnce(
      makeProfileResponse({ has_logo: true }),
    );

    renderScreen();

    const input = (await screen.findByLabelText(/upload logo/i)) as HTMLInputElement;
    const file = new File(["fake-logo"], "logo.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(mockedProfileService.uploadLogo).toHaveBeenCalledWith(file));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an inline error for oversized logo uploads without uploading", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(makeProfileResponse());

    renderScreen();

    const input = (await screen.findByLabelText(/upload logo/i)) as HTMLInputElement;
    const file = new File(["fake-logo"], "logo.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: MAX_LOGO_SIZE_BYTES + 1 });

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      `Logo must be ${logoSizeLimitLabel} or smaller.`,
    );
    expect(mockedProfileService.uploadLogo).not.toHaveBeenCalled();
  });

  it("opens the remove confirmation modal and cancels without deleting", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(
      makeProfileResponse({ has_logo: true }),
    );

    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /remove/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Remove logo?")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByText("Remove logo?")).not.toBeInTheDocument();
    });
    expect(mockedProfileService.deleteLogo).not.toHaveBeenCalled();
  });

  it("confirms logo removal and hides the preview", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(
      makeProfileResponse({ has_logo: true }),
    );
    mockedProfileService.deleteLogo.mockResolvedValueOnce(undefined);

    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /remove/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^remove$/i }));

    await waitFor(() => expect(mockedProfileService.deleteLogo).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.queryByAltText(/business logo preview/i)).not.toBeInTheDocument();
      expect(screen.getByTestId("settings-logo-preview-tile")).toHaveClass(
        "h-[128px]",
        "w-[128px]",
        "rounded-[var(--radius-document)]",
        "bg-surface-container-lowest",
      );
      expect(screen.getByText("No logo")).toBeInTheDocument();
    });
  });

  it("shows inline upload errors without affecting save feedback", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(makeProfileResponse());
    mockedProfileService.uploadLogo.mockRejectedValueOnce(new Error("Unable to upload logo"));

    renderScreen();

    const input = (await screen.findByLabelText(/upload logo/i)) as HTMLInputElement;
    const file = new File(["fake-logo"], "logo.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to upload logo");
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
