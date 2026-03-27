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

function uploadLogo(file: File): Promise<ProfileResponse> {
  const formData = new FormData();
  formData.append("file", file);

  return request<ProfileResponse>("/api/profile/logo", {
    method: "POST",
    body: formData,
  });
}

function deleteLogo(): Promise<void> {
  return request<null>("/api/profile/logo", {
    method: "DELETE",
  }).then(() => undefined);
}

export const profileService = {
  getProfile,
  updateProfile,
  uploadLogo,
  deleteLogo,
};
