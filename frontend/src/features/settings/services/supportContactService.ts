import { request } from "@/shared/lib/http";

export type SupportContactCategory =
  | "bug"
  | "quote_quality"
  | "confusing_workflow"
  | "security_privacy"
  | "other";

interface SupportContactPayload {
  category: SupportContactCategory;
  message: string;
}

interface SupportContactResponse {
  message: string;
}

function submit(payload: SupportContactPayload): Promise<SupportContactResponse> {
  return request<SupportContactResponse>("/api/support/contact", {
    method: "POST",
    body: payload,
  });
}

export const supportContactService = {
  submit,
};

