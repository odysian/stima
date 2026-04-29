import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { profileService } from "@/features/profile/services/profileService";
import type { ProfileUpdateRequest } from "@/features/profile/types/profile.types";
import { clearCsrfToken, setCsrfToken } from "@/shared/lib/http";
import { server } from "@/shared/tests/mocks/server";

const updatePayload: ProfileUpdateRequest = {
  business_name: "Summit Exterior Care",
  first_name: "Jane",
  last_name: "Doe",
  trade_type: "Plumber",
  timezone: "America/New_York",
};

describe("profileService integration (MSW)", () => {
  afterEach(() => {
    clearCsrfToken();
  });

  it("getProfile returns parsed profile response", async () => {
    const profile = await profileService.getProfile();

    expect(profile).toEqual({
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
      trade_type: "Landscaper",
      timezone: null,
      default_tax_rate: null,
      has_logo: false,
    });
  });

  it("updateProfile sends CSRF header and returns updated profile", async () => {
    setCsrfToken("integration-csrf-token");

    let capturedCsrfHeader: string | null = null;

    server.use(
      http.patch("/api/profile", async ({ request }) => {
        capturedCsrfHeader = request.headers.get("X-CSRF-Token");
        const body = (await request.json()) as ProfileUpdateRequest;

        return HttpResponse.json({
          id: "user-1",
          email: "test@example.com",
          is_active: true,
          is_onboarded: true,
          phone_number: null,
          business_address_line1: null,
          business_address_line2: null,
          business_city: null,
          business_state: null,
          business_postal_code: null,
          default_tax_rate: null,
          has_logo: false,
          ...body,
        });
      }),
    );

    const updatedProfile = await profileService.updateProfile(updatePayload);

    expect(capturedCsrfHeader).toBe("integration-csrf-token");
    expect(updatedProfile).toEqual({
      id: "user-1",
      email: "test@example.com",
      is_active: true,
      is_onboarded: true,
      phone_number: null,
      business_address_line1: null,
      business_address_line2: null,
      business_city: null,
      business_state: null,
      business_postal_code: null,
      default_tax_rate: null,
      has_logo: false,
      ...updatePayload,
    });
  });

  it("updateProfile propagates CSRF validation errors", async () => {
    clearCsrfToken();

    await expect(profileService.updateProfile(updatePayload)).rejects.toThrow("CSRF token missing");
  });

  it("uploadLogo sends multipart file payload and returns updated profile", async () => {
    setCsrfToken("integration-csrf-token");

    let capturedCsrfHeader: string | null = null;

    server.use(
      http.post("/api/profile/logo", async ({ request }) => {
        capturedCsrfHeader = request.headers.get("X-CSRF-Token");

        return HttpResponse.json({
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
          trade_type: "Landscaper",
          timezone: null,
          default_tax_rate: null,
          has_logo: true,
        });
      }),
    );

    const updatedProfile = await profileService.uploadLogo(
      new File(["fake-logo"], "logo.png", { type: "image/png" }),
    );

    expect(capturedCsrfHeader).toBe("integration-csrf-token");
    expect(updatedProfile.has_logo).toBe(true);
  });

  it("deleteLogo sends CSRF header and resolves void on 204", async () => {
    setCsrfToken("integration-csrf-token");

    let capturedCsrfHeader: string | null = null;

    server.use(
      http.delete("/api/profile/logo", ({ request }) => {
        capturedCsrfHeader = request.headers.get("X-CSRF-Token");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(profileService.deleteLogo()).resolves.toBeUndefined();
    expect(capturedCsrfHeader).toBe("integration-csrf-token");
  });
});
