type JobStatusReader = (jobId: string) => Promise<{ status: string }>;

interface PollJobUntilSuccessOptions {
  jobId: string;
  getJobStatus: JobStatusReader;
  terminalErrorMessage: string;
  timeoutErrorMessage: string;
  pollIntervalMs?: number;
  maxPolls?: number;
}

export async function pollJobUntilSuccess({
  jobId,
  getJobStatus,
  terminalErrorMessage,
  timeoutErrorMessage,
  pollIntervalMs = 1500,
  maxPolls = 20,
}: PollJobUntilSuccessOptions): Promise<void> {
  for (let pollCount = 0; pollCount < maxPolls; pollCount += 1) {
    const job = await getJobStatus(jobId);
    if (job.status === "success") {
      return;
    }

    if (job.status === "terminal") {
      throw new Error(terminalErrorMessage);
    }

    if (pollCount === maxPolls - 1) {
      break;
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, pollIntervalMs);
    });
  }

  throw new Error(timeoutErrorMessage);
}