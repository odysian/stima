import type {
  ProfileResponse,
  ProfileUpdateRequest,
} from "@/features/profile/types/profile.types";
import { request } from "@/shared/lib/http";

function getProfile(): Promise<ProfileResponse> {
  return request<ProfileResponse>("/api/profile");
}

function updateProfile(data: ProfileUpdateRequest): Promise<ProfileResponse> {
  return request<ProfileResponse>("/api/profile", {
    method: "PATCH",
    body: data,
  });
}

export const profileService = {
  getProfile,
  updateProfile,
};
