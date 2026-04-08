type JobStatusReader = (jobId: string) => Promise<{ status: string }>;

interface PollJobUntilCompletionOptions {
  jobId: string;
  getJobStatus: JobStatusReader;
  timeoutErrorMessage: string;
  pollIntervalMs?: number;
  maxPolls?: number;
  signal?: AbortSignal;
}

interface PollJobUntilSuccessOptions extends PollJobUntilCompletionOptions {
  terminalErrorMessage: string;
}

export class JobPollingAbortedError extends Error {
  constructor() {
    super("Job polling aborted");
    this.name = "JobPollingAbortedError";
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new JobPollingAbortedError();
  }
}

function waitForNextPoll(pollIntervalMs: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, pollIntervalMs);

    function onAbort(): void {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      reject(new JobPollingAbortedError());
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function isJobPollingAbortedError(error: unknown): error is JobPollingAbortedError {
  return error instanceof JobPollingAbortedError;
}

export async function pollJobUntilCompletion({
  jobId,
  getJobStatus,
  timeoutErrorMessage,
  pollIntervalMs = 1500,
  maxPolls = 20,
  signal,
}: PollJobUntilCompletionOptions): Promise<"success" | "terminal"> {
  for (let pollCount = 0; pollCount < maxPolls; pollCount += 1) {
    throwIfAborted(signal);
    const job = await getJobStatus(jobId);
    if (job.status === "success") {
      return "success";
    }

    if (job.status === "terminal") {
      return "terminal";
    }

    if (pollCount === maxPolls - 1) {
      break;
    }

    await waitForNextPoll(pollIntervalMs, signal);
  }

  throw new Error(timeoutErrorMessage);
}

export async function pollJobUntilSuccess({
  terminalErrorMessage,
  ...options
}: PollJobUntilSuccessOptions): Promise<void> {
  const result = await pollJobUntilCompletion(options);
  if (result === "terminal") {
    throw new Error(terminalErrorMessage);
  }
}
