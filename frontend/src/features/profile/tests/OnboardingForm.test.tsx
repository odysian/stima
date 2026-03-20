import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { OnboardingForm } from "@/features/profile/components/OnboardingForm";
import { profileService } from "@/features/profile/services/profileService";
import type { ProfileResponse } from "@/features/profile/types/profile.types";

vi.mock("@/features/auth/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/profile/services/profileService", () => ({
  profileService: {
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
  },
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedProfileService = vi.mocked(profileService);

function renderForm(): void {
  render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingForm />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function profileResponse(overrides: Partial<ProfileResponse> = {}): ProfileResponse {
  return {
    id: "user-1",
    email: "test@example.com",
    is_active: true,
    is_onboarded: true,
    business_name: "Summit Exterior Care",
    first_name: "Jane",
    last_name: "Doe",
    trade_type: "Landscaping",
    ...overrides,
  };
}

beforeEach(() => {
  mockedUseAuth.mockReturnValue({
    user: null,
    isLoading: false,
    isOnboarded: false,
    refreshUser: vi.fn(async () => undefined),
    login: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("OnboardingForm", () => {
  it("renders required onboarding fields with default trade type", () => {
    renderForm();

    expect(screen.getByLabelText(/business name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Landscaping" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Power Washing" })).toBeInTheDocument();
    expect((screen.getByLabelText(/trade type/i) as HTMLSelectElement).value).toBe("Landscaping");
  });

  it("submits profile updates and navigates to root on success", async () => {
    const refreshUser = vi.fn(async () => undefined);
    mockedUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      isOnboarded: false,
      refreshUser,
      login: vi.fn(async () => undefined),
      register: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    });
    mockedProfileService.updateProfile.mockResolvedValueOnce(
      profileResponse({ trade_type: "Power Washing" }),
    );

    renderForm();

    fireEvent.change(screen.getByLabelText(/business name/i), {
      target: { value: "Summit Exterior Care" },
    });
    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: "Jane" },
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: "Doe" },
    });
    fireEvent.change(screen.getByLabelText(/trade type/i), {
      target: { value: "Power Washing" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(mockedProfileService.updateProfile).toHaveBeenCalledWith({
        business_name: "Summit Exterior Care",
        first_name: "Jane",
        last_name: "Doe",
        trade_type: "Power Washing",
      });
    });
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Home")).toBeInTheDocument();
  });

  it("shows an error and does not navigate when submit fails", async () => {
    mockedProfileService.updateProfile.mockRejectedValueOnce(new Error("Unable to save profile"));

    renderForm();

    fireEvent.change(screen.getByLabelText(/business name/i), {
      target: { value: "Summit Exterior Care" },
    });
    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: "Jane" },
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: "Doe" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save profile");
    expect(screen.queryByText("Home")).not.toBeInTheDocument();
  });

  it("disables submit button while request is in-flight", async () => {
    let resolveUpdate: ((value: ProfileResponse) => void) | undefined;
    mockedProfileService.updateProfile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );

    renderForm();

    fireEvent.change(screen.getByLabelText(/business name/i), {
      target: { value: "Summit Exterior Care" },
    });
    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: "Jane" },
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: "Doe" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    const submitButton = screen.getByRole("button", { name: /loading/i });
    expect(submitButton).toBeDisabled();

    resolveUpdate?.(profileResponse());
    await waitFor(() => expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled());
  });
});
