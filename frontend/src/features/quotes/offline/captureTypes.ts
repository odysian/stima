export type LocalCaptureStatus =
  | "local_only"
  | "ready_to_extract"
  | "submitting"
  | "extract_failed"
  | "synced"
  | "discarded";

export type SubmitFailureKind =
  | "offline"
  | "timeout"
  | "auth_required"
  | "csrf_failed"
  | "validation_failed"
  | "server_retryable"
  | "server_terminal";

export interface LocalCaptureCustomerSnapshot {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface LocalCaptureSession {
  sessionId: string;
  userId: string;
  status: LocalCaptureStatus;
  notes: string;
  customerId?: string | null;
  customerSnapshot?: LocalCaptureCustomerSnapshot | null;
  clipIds: string[];
  idempotencyKey?: string | null;
  outboxJobId?: string | null;
  serverQuoteId?: string | null;
  extractJobId?: string | null;
  lastFailureKind?: SubmitFailureKind | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
}

export interface CreateLocalCaptureInput {
  userId: string;
  notes?: string;
  customerId?: string | null;
  customerSnapshot?: LocalCaptureSession["customerSnapshot"];
}

export type LocalCaptureSummary = Pick<
  LocalCaptureSession,
  | "sessionId"
  | "status"
  | "notes"
  | "updatedAt"
  | "lastFailureKind"
  | "lastError"
  | "customerId"
  | "customerSnapshot"
> & {
  clipCount: number;
  outboxStatus?: OutboxJobStatus | null;
  outboxAttemptCount?: number;
  outboxMaxAttempts?: number;
};

export interface LocalSyncEvent {
  eventId: string;
  sessionId: string;
  userId: string;
  level: "info" | "warning" | "error";
  message: string;
  createdAt: string;
}

export type CreateLocalSyncEventInput = Omit<LocalSyncEvent, "eventId" | "createdAt">;

export class AudioClipMissingError extends Error {
  clipId: string;

  constructor(clipId: string) {
    super(`Audio clip is missing from local storage: ${clipId}`);
    this.name = "AudioClipMissingError";
    this.clipId = clipId;
  }
}

export interface LocalAudioClip {
  clipId: string;
  sessionId: string;
  userId: string;
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
  sequenceNumber: number;
  objectUrl?: never;
  createdAt: string;
}

export type LocalAudioClipMeta = Omit<LocalAudioClip, "blob">;

export interface LocalDraftRecord {
  draftKey: string;
  userId: string;
  documentId: string;
  docType: "quote" | "invoice";
  payload: unknown;
  updatedAt: string;
}

export type OutboxJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed_retryable"
  | "failed_terminal";

export interface OutboxJob {
  jobId: string;
  userId: string;
  sessionId: string;
  idempotencyKey: string;
  status: OutboxJobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  lastFailureKind: SubmitFailureKind | null;
  lastError: string | null;
  serverQuoteId: string | null;
  serverJobId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnqueueJobInput {
  userId: string;
  sessionId: string;
  idempotencyKey: string;
  maxAttempts?: number;
}
