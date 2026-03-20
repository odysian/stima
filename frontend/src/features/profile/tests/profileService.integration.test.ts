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
  trade_type: "Power Washing",
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
      trade_type: "Landscaping",
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
      ...updatePayload,
    });
  });

  it("updateProfile propagates CSRF validation errors", async () => {
    clearCsrfToken();

    await expect(profileService.updateProfile(updatePayload)).rejects.toThrow("CSRF token missing");
  });
});
