import type { JobStatusResponse } from "@/features/quotes/types/quote.types";
import {
  EXTRACTION_MAX_POLLS,
  EXTRACTION_POLL_INTERVAL_MS,
} from "@/features/quotes/components/captureScreenHelpers";
import { jobService } from "@/shared/lib/jobService";

interface PollExtractionJobUntilQuoteArgs {
  jobId: string;
  isMounted: () => boolean;
  onQuoteReady: (job: JobStatusResponse) => Promise<void>;
}

export async function pollExtractionJobUntilQuote({
  jobId,
  isMounted,
  onQuoteReady,
}: PollExtractionJobUntilQuoteArgs): Promise<void> {
  for (let pollCount = 0; pollCount < EXTRACTION_MAX_POLLS; pollCount += 1) {
    const job = await jobService.getJobStatus(jobId);
    if (!isMounted()) {
      return;
    }

    if (job.quote_id) {
      await onQuoteReady(job);
      return;
    }

    if (job.status === "success") {
      throw new Error("Extraction completed without a persisted draft. Please try again.");
    }

    if (job.status === "terminal") {
      throw new Error("Extraction failed. Please try again.");
    }

    if (pollCount === EXTRACTION_MAX_POLLS - 1) {
      break;
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, EXTRACTION_POLL_INTERVAL_MS);
    });
    if (!isMounted()) {
      return;
    }
  }

  throw new Error(
    "Extraction is taking longer than expected. Please try again.",
  );
}
