import type { JobStatusResponse } from "@/features/quotes/types/quote.types";
import { request } from "@/shared/lib/http";

function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  return request<JobStatusResponse>(`/api/jobs/${jobId}`);
}

export const jobService = {
  getJobStatus,
};
