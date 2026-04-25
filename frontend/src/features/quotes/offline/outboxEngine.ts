import { EXTRACTION_MAX_POLLS, EXTRACTION_POLL_INTERVAL_MS } from "@/features/quotes/components/captureScreenHelpers";
import {
  appendSyncEvent,
  getCaptureSession,
  markCaptureStatus,
  updateCaptureField,
} from "@/features/quotes/offline/captureRepository";
import type { OutboxJob, SubmitFailureKind } from "@/features/quotes/offline/captureTypes";
import { classifySubmitFailure } from "@/features/quotes/offline/classifySubmitFailure";
import {
  listPendingJobs,
  updateJobStatus,
} from "@/features/quotes/offline/outboxRepository";
import { quoteService } from "@/features/quotes/services/quoteService";
import { jobService } from "@/shared/lib/jobService";

const RETRYABLE_FAILURE_KINDS = new Set<SubmitFailureKind>([
  "offline",
  "timeout",
  "server_retryable",
  "auth_required",
]);
const TERMINAL_FAILURE_KINDS = new Set<SubmitFailureKind>([
  "validation_failed",
  "server_terminal",
]);
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 120_000;

const inFlightPasses = new Map<string, Promise<void>>();
const authPausedUsers = new Set<string>();

export type OutboxEngineEvent =
  | { kind: "sync_success"; sessionId: string; quoteId: string | null }
  | { kind: "sync_terminal_failure"; sessionId: string; failureKind: SubmitFailureKind }
  | { kind: "auth_required"; sessionId: string };

interface OutboxPassOptions {
  onEvent?: (event: OutboxEngineEvent) => void;
  forceAfterAuth?: boolean;
}

export async function runOutboxPass(userId: string, opts?: OutboxPassOptions): Promise<void> {
  if (!userId) {
    return;
  }

  const existingPass = inFlightPasses.get(userId);
  if (existingPass) {
    return existingPass;
  }

  const pass = runOutboxPassInternal(userId, opts)
    .catch((error) => {
      console.warn("Outbox pass failed.", error);
    })
    .finally(() => {
      inFlightPasses.delete(userId);
    });
  inFlightPasses.set(userId, pass);
  return pass;
}

export function registerOnlineTrigger(userId: string, opts?: OutboxPassOptions): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = () => {
    void runOutboxPass(userId, opts);
  };

  window.addEventListener("online", handler);
  return () => {
    window.removeEventListener("online", handler);
  };
}

async function runOutboxPassInternal(userId: string, opts?: OutboxPassOptions): Promise<void> {
  if (opts?.forceAfterAuth) {
    authPausedUsers.delete(userId);
  }

  if (authPausedUsers.has(userId)) {
    return;
  }

  const pendingJobs = await listPendingJobs(userId);
  for (const job of pendingJobs) {
    if (authPausedUsers.has(userId)) {
      return;
    }

    await processJob(job, opts);
  }
}

async function processJob(job: OutboxJob, opts?: OutboxPassOptions): Promise<void> {
  await updateJobStatus(job.jobId, {
    status: "running",
    nextRetryAt: null,
  });

  const session = await getCaptureSession(job.sessionId);
  if (!session) {
    await markTerminalFailure(job, "server_terminal", "Capture session was missing on this device.", opts);
    return;
  }

  try {
    const extraction = await quoteService.extract({
      clipIds: session.clipIds,
      notes: session.notes,
      customerId: session.customerId ?? undefined,
      idempotencyKey: job.idempotencyKey,
    });

    if (extraction.type === "sync") {
      await markSuccess(job, {
        quoteId: extraction.quoteId,
        serverJobId: null,
      }, opts);
      return;
    }

    const jobResult = await pollForPersistedQuote(extraction.jobId);
    await markSuccess(job, {
      quoteId: jobResult.quote_id,
      serverJobId: extraction.jobId,
    }, opts);
  } catch (error) {
    const failureKind = classifySubmitFailure(error);
    const message = error instanceof Error ? error.message : "Unable to sync capture.";

    if (TERMINAL_FAILURE_KINDS.has(failureKind)) {
      await markTerminalFailure(job, failureKind, message, opts);
      return;
    }

    if (failureKind === "auth_required") {
      authPausedUsers.add(job.userId);
      opts?.onEvent?.({ kind: "auth_required", sessionId: job.sessionId });
    }

    if (RETRYABLE_FAILURE_KINDS.has(failureKind)) {
      await markRetryableFailure(job, failureKind, message, opts);
      return;
    }

    await markTerminalFailure(job, "server_terminal", message, opts);
  }
}

async function markSuccess(
  job: OutboxJob,
  params: { quoteId: string | null; serverJobId: string | null },
  opts?: OutboxPassOptions,
): Promise<void> {
  await updateJobStatus(job.jobId, {
    status: "succeeded",
    serverQuoteId: params.quoteId,
    serverJobId: params.serverJobId,
    lastFailureKind: null,
    lastError: null,
    nextRetryAt: null,
  });
  await markCaptureStatus(job.sessionId, "synced");
  await updateCaptureField(job.sessionId, {
    serverQuoteId: params.quoteId,
    extractJobId: params.serverJobId,
  });
  await appendSyncEvent({
    sessionId: job.sessionId,
    userId: job.userId,
    level: "info",
    message: "Extraction synced to server.",
  });

  opts?.onEvent?.({
    kind: "sync_success",
    sessionId: job.sessionId,
    quoteId: params.quoteId,
  });
}

async function markRetryableFailure(
  job: OutboxJob,
  failureKind: SubmitFailureKind,
  message: string,
  opts?: OutboxPassOptions,
): Promise<void> {
  const nextAttemptCount = job.attemptCount + 1;
  if (nextAttemptCount >= job.maxAttempts) {
    await markTerminalFailure(job, failureKind, message, opts);
    return;
  }

  const nextRetryAt = computeNextRetryAt(nextAttemptCount);
  await updateJobStatus(job.jobId, {
    status: "failed_retryable",
    lastFailureKind: failureKind,
    lastError: message,
    attemptCount: nextAttemptCount,
    nextRetryAt,
  });

  await appendSyncEvent({
    sessionId: job.sessionId,
    userId: job.userId,
    level: "warning",
    message: `Retry ${nextAttemptCount} failed: ${failureKind}`,
  });
}

async function markTerminalFailure(
  job: OutboxJob,
  failureKind: SubmitFailureKind,
  message: string,
  opts?: OutboxPassOptions,
): Promise<void> {
  const nextAttemptCount = Math.min(job.attemptCount + 1, job.maxAttempts);
  await updateJobStatus(job.jobId, {
    status: "failed_terminal",
    lastFailureKind: failureKind,
    lastError: message,
    attemptCount: nextAttemptCount,
    nextRetryAt: null,
  });
  await markCaptureStatus(job.sessionId, "extract_failed", {
    failureKind,
    error: message,
  });
  await appendSyncEvent({
    sessionId: job.sessionId,
    userId: job.userId,
    level: "error",
    message: `Extraction failed permanently: ${failureKind}`,
  });

  opts?.onEvent?.({
    kind: "sync_terminal_failure",
    sessionId: job.sessionId,
    failureKind,
  });
}

async function pollForPersistedQuote(jobId: string): Promise<{ quote_id: string }> {
  for (let pollCount = 0; pollCount < EXTRACTION_MAX_POLLS; pollCount += 1) {
    const job = await jobService.getJobStatus(jobId);

    if (job.quote_id) {
      return { quote_id: job.quote_id };
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
  }

  throw new Error("Extraction is taking longer than expected. Please try again.");
}

function computeNextRetryAt(attemptCount: number): string {
  const delayMs = Math.min(BACKOFF_BASE_MS * (2 ** Math.max(attemptCount - 1, 0)), BACKOFF_MAX_MS);
  return new Date(Date.now() + delayMs).toISOString();
}
