import { updateCaptureField } from "@/features/quotes/offline/captureRepository";
import { enqueueJob, getJobForSession, updateJobStatus } from "@/features/quotes/offline/outboxRepository";

interface QueueOutboxRetryParams {
  userId: string;
  sessionId: string;
  idempotencyKey: string;
}

interface MarkOutboxSuccessParams {
  sessionId: string | null;
  quoteId: string | null;
  extractJobId: string | null;
}

export async function queueOutboxRetryJob(params: QueueOutboxRetryParams): Promise<void> {
  const queuedJob = await enqueueJob({
    userId: params.userId,
    sessionId: params.sessionId,
    idempotencyKey: params.idempotencyKey,
  });

  await updateCaptureField(params.sessionId, { outboxJobId: queuedJob.jobId });
}

export async function markOutboxJobSucceeded(params: MarkOutboxSuccessParams): Promise<void> {
  if (!params.sessionId) {
    return;
  }

  const outboxJob = await getJobForSession(params.sessionId);
  if (!outboxJob) {
    return;
  }

  await updateJobStatus(outboxJob.jobId, {
    status: "succeeded",
    serverQuoteId: params.quoteId,
    serverJobId: params.extractJobId,
    lastFailureKind: null,
    lastError: null,
    nextRetryAt: null,
  });
}
