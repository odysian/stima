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
import {
  ADDRESS_CITY_MAX_CHARS,
  ADDRESS_LINE_MAX_CHARS,
  ADDRESS_POSTAL_CODE_MAX_CHARS,
  MAX_LOGO_SIZE_BYTES,
  PHONE_NUMBER_MAX_CHARS,
} from "@/shared/lib/inputLimits";
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
    phone_number: null,
    business_address_line1: null,
    business_address_line2: null,
    business_city: null,
    business_state: null,
    business_postal_code: null,
    formatted_address: null,
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

async function openBusinessProfileEditMode(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: /edit business profile/i }));
  await screen.findByLabelText(/business name/i);
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
    authMode: "verified",
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

  it("renders business profile in read-only mode by default and reveals form on edit", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(
      makeProfileResponse({
        email: "owner@example.com",
        business_name: "Bright Lawn Care",
        first_name: "Jordan",
        last_name: "Hill",
        phone_number: "(555) 123-4567",
        formatted_address: "123 Main St\nApt 4\nCleveland, OH 44113",
        trade_type: "Plumber",
        default_tax_rate: 0.08,
      }),
    );

    renderScreen();

    expect(await screen.findByText("Bright Lawn Care")).toBeInTheDocument();
    expect(screen.getByText("Jordan Hill")).toBeInTheDocument();
    expect(screen.getByText("Contact")).toBeInTheDocument();
    expect(screen.getByText("Business Defaults")).toBeInTheDocument();
    expect(screen.getByText("Preferences")).toBeInTheDocument();
    expect(screen.getByText("Business phone")).toBeInTheDocument();
    expect(screen.getByText("(555) 123-4567")).toBeInTheDocument();
    expect(screen.getByText("Business address")).toBeInTheDocument();
    const addressElement = screen.getByText((content) =>
      content.includes("123 Main St") && content.includes("Cleveland, OH 44113"),
    );
    expect(addressElement).toHaveClass("whitespace-pre-wrap");
    expect(screen.getByText("Trade")).toBeInTheDocument();
    expect(screen.getByText("Plumber")).toBeInTheDocument();
    expect(screen.getByText("Tax rate")).toBeInTheDocument();
    expect(screen.getByText("8% tax")).toBeInTheDocument();
    expect(screen.getByText("Timezone")).toBeInTheDocument();
    expect(screen.getByText("America/New_York")).toBeInTheDocument();
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("Email")).toHaveClass(
      "font-bold",
      "uppercase",
      "tracking-[0.12em]",
      "text-outline",
    );
    expect(screen.getByRole("button", { name: /edit business profile/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/upload logo/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.getByText("Account").closest("div")).toHaveClass("bg-surface-container-low");
    expect(screen.queryByText("Session")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /settings/i })).toHaveClass("text-primary");
    expect(screen.queryByText("Appearance")).not.toBeInTheDocument();

    await openBusinessProfileEditMode();
    expect(screen.getByDisplayValue("Bright Lawn Care")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Jordan")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Hill")).toBeInTheDocument();
    expect(screen.getByLabelText(/trade type/i)).toHaveValue("Plumber");
    expect(screen.getByLabelText(/timezone/i)).toHaveValue("America/New_York");
    expect(screen.getByLabelText(/business phone/i)).toHaveAttribute(
      "maxLength",
      PHONE_NUMBER_MAX_CHARS.toString(),
    );
    expect(screen.getByLabelText(/business phone/i)).toHaveAttribute(
      "placeholder",
      "(555) 123-4567",
    );
    expect(screen.getByLabelText(/business phone/i)).toHaveAttribute("type", "tel");
    expect(screen.getByLabelText(/business phone/i)).toHaveAttribute("inputMode", "tel");
    expect(screen.getByText(/^address$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/street address or p\.o\. box/i)).toHaveAttribute(
      "maxLength",
      ADDRESS_LINE_MAX_CHARS.toString(),
    );
    expect(screen.getByPlaceholderText(/street address or p\.o\. box/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/apt, suite, unit, building \(optional\)/i)).toHaveAttribute(
      "maxLength",
      ADDRESS_LINE_MAX_CHARS.toString(),
    );
    expect(screen.getByPlaceholderText(/apt, suite, unit, building \(optional\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^city$/i)).toHaveAttribute(
      "maxLength",
      ADDRESS_CITY_MAX_CHARS.toString(),
    );
    expect(screen.getByLabelText(/^state$/i)).toHaveValue("");
    expect(screen.getByRole("option", { name: "Select" })).toHaveValue("");
    expect(screen.getByLabelText(/zip code/i)).toHaveAttribute(
      "maxLength",
      ADDRESS_POSTAL_CODE_MAX_CHARS.toString(),
    );
    expect(screen.queryByText(/postal code/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/upload logo/i)).toBeInTheDocument();
  });

  it("shows fallback placeholders when optional contact values are missing", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(
      makeProfileResponse({
        phone_number: null,
        formatted_address: null,
      }),
    );

    renderScreen();

    await screen.findByText("Summit Exterior Care");

    const businessPhoneRow = screen.getByText("Business phone").closest("dl");
    expect(businessPhoneRow).not.toBeNull();
    expect(within(businessPhoneRow!).getByText("—")).toBeInTheDocument();

    const businessAddressRow = screen.getByText("Business address").closest("dl");
    expect(businessAddressRow).not.toBeNull();
    expect(within(businessAddressRow!).getByText("—")).toBeInTheDocument();
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

    await openBusinessProfileEditMode();

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
      authMode: "verified",
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

    await openBusinessProfileEditMode();

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
        phone_number: null,
        business_address_line1: null,
        business_address_line2: null,
        business_city: null,
        business_state: null,
        business_postal_code: null,
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

  it("restores last saved values when leaving edit mode without saving", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(makeProfileResponse({
      business_name: "Summit Exterior Care",
      first_name: "Alex",
      last_name: "Stone",
    }));

    renderScreen();
    await openBusinessProfileEditMode();

    fireEvent.change(screen.getByLabelText(/business name/i), {
      target: { value: "Unsaved Name" },
    });
    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: "Unsaved First" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByLabelText(/business name/i)).not.toBeInTheDocument();
    expect(screen.getByText("Summit Exterior Care")).toBeInTheDocument();
    expect(screen.getByText("Alex Stone")).toBeInTheDocument();
    expect(mockedProfileService.updateProfile).not.toHaveBeenCalled();
  });

  it("updates the theme preference immediately from the dropdown", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(makeProfileResponse());

    renderScreen();

    await openBusinessProfileEditMode();

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

    await openBusinessProfileEditMode();
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
        phone_number: null,
        business_address_line1: null,
        business_address_line2: null,
        business_city: null,
        business_state: null,
        business_postal_code: null,
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
      authMode: "verified",
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

    await openBusinessProfileEditMode();
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

    await openBusinessProfileEditMode();
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

    await openBusinessProfileEditMode();
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    const submitButton = screen.getByRole("button", { name: /save changes/i });
    expect(submitButton).toBeDisabled();
    expect(within(submitButton).getByTestId("button-spinner")).toHaveClass("animate-spin");

    resolveUpdate?.(makeProfileResponse());
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /edit business profile/i })).toBeInTheDocument();
    });
  });

  it("requires confirmation before signing out", async () => {
    const logout = vi.fn(async () => undefined);
    mockedUseAuth.mockReturnValue({
      authMode: "verified",
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

  it("renders compact logo preview in display mode and full controls in edit mode", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(
      makeProfileResponse({ has_logo: true }),
    );

    renderScreen();

    expect(await screen.findByText("Business Profile")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-logo-block")).not.toBeInTheDocument();
    expect(await screen.findByAltText(/business logo/i)).toHaveClass(
      "h-full",
      "w-full",
      "object-contain",
    );
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/upload logo/i)).not.toBeInTheDocument();
    await openBusinessProfileEditMode();
    expect(screen.getByTestId("settings-logo-block")).toHaveClass(
      "rounded-[var(--radius-document)]",
      "bg-surface-container-low",
      "p-4",
    );
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/upload logo/i)).toBeInTheDocument();
    expect(screen.queryByText(/upload new/i)).not.toBeInTheDocument();
  });

  it("shows a business icon placeholder in display mode and full upload controls in edit mode", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(makeProfileResponse());

    const { container } = renderScreen();

    expect(await screen.findByText("Business Profile")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-logo-block")).not.toBeInTheDocument();
    expect(container.querySelector("svg.lucide-building2, svg.lucide-building-2")).toBeInTheDocument();
    expect(screen.queryByLabelText(/upload logo/i)).not.toBeInTheDocument();
    await openBusinessProfileEditMode();
    expect(screen.getByTestId("settings-logo-block")).toHaveClass(
      "rounded-[var(--radius-document)]",
      "bg-surface-container-low",
      "p-4",
    );
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

    await openBusinessProfileEditMode();
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

    await openBusinessProfileEditMode();
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

    await openBusinessProfileEditMode();
    const input = (await screen.findByLabelText(/upload logo/i)) as HTMLInputElement;
    const file = new File(["fake-logo"], "logo.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(mockedProfileService.uploadLogo).toHaveBeenCalledWith(file));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an inline error for oversized logo uploads without uploading", async () => {
    mockedProfileService.getProfile.mockResolvedValueOnce(makeProfileResponse());

    renderScreen();

    await openBusinessProfileEditMode();
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

    await openBusinessProfileEditMode();
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

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

    await openBusinessProfileEditMode();
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
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

    await openBusinessProfileEditMode();
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
    expect(await screen.findByRole("button", { name: /edit business profile/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/business name/i)).not.toBeInTheDocument();
  });

  it("shows an error state when profile fetch fails and does not render the form", async () => {
    mockedProfileService.getProfile.mockRejectedValueOnce(new Error("Unable to load settings"));

    renderScreen();

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load settings");
    expect(screen.queryByLabelText(/business name/i)).not.toBeInTheDocument();
  });
});
