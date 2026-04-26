import type {
  LocalCaptureSession,
  LocalCaptureStatus,
  LocalSyncEvent,
  SubmitFailureKind,
} from "@/features/quotes/offline/captureTypes";

type UnknownRecord = Record<string, unknown>;

export const CAPTURE_STATUSES = new Set<LocalCaptureStatus>([
  "local_only",
  "ready_to_extract",
  "submitting",
  "extract_failed",
  "synced",
  "discarded",
]);

export const SYNC_EVENT_LEVELS = new Set<LocalSyncEvent["level"]>(["info", "warning", "error"]);

export const SUBMIT_FAILURE_KINDS = new Set<SubmitFailureKind>([
  "offline",
  "timeout",
  "auth_required",
  "csrf_failed",
  "validation_failed",
  "server_retryable",
  "server_terminal",
]);

export const IMMUTABLE_CAPTURE_FIELDS = new Set<keyof LocalCaptureSession>(["sessionId", "createdAt"]);

export function parseStoredCapture(value: unknown): LocalCaptureSession | null {
  if (!isRecord(value)) {
    return null;
  }

  const sessionId = value.sessionId;
  const userId = value.userId;
  const status = value.status;
  const notes = value.notes;
  const clipIds = value.clipIds;
  const createdAt = value.createdAt;
  const updatedAt = value.updatedAt;
  if (
    typeof sessionId !== "string" ||
    typeof userId !== "string" ||
    typeof status !== "string" ||
    typeof notes !== "string" ||
    !Array.isArray(clipIds) ||
    clipIds.some((clipId) => typeof clipId !== "string") ||
    typeof createdAt !== "string" ||
    typeof updatedAt !== "string"
  ) {
    return null;
  }

  if (!CAPTURE_STATUSES.has(status as LocalCaptureStatus)) {
    return null;
  }

  const customerId = value.customerId;
  const customerSnapshot = parseCustomerSnapshot(value.customerSnapshot);
  const idempotencyKey = value.idempotencyKey;
  const outboxJobId = value.outboxJobId;
  const serverQuoteId = value.serverQuoteId;
  const extractJobId = value.extractJobId;
  const lastFailureKind = value.lastFailureKind;
  const lastError = value.lastError;
  const lastOpenedAt = value.lastOpenedAt;

  if (
    !isOptionalNullableString(customerId) ||
    customerSnapshot === undefined ||
    !isOptionalNullableString(idempotencyKey) ||
    !isOptionalNullableString(outboxJobId) ||
    !isOptionalNullableString(serverQuoteId) ||
    !isOptionalNullableString(extractJobId) ||
    !isOptionalNullableString(lastError) ||
    (lastOpenedAt !== undefined && typeof lastOpenedAt !== "string")
  ) {
    return null;
  }

  if (
    lastFailureKind !== undefined &&
    lastFailureKind !== null &&
    (typeof lastFailureKind !== "string" ||
      !SUBMIT_FAILURE_KINDS.has(lastFailureKind as SubmitFailureKind))
  ) {
    return null;
  }

  return {
    sessionId,
    userId,
    status: status as LocalCaptureStatus,
    notes,
    customerId: customerId as string | null | undefined,
    customerSnapshot,
    clipIds: [...clipIds],
    idempotencyKey: idempotencyKey as string | null | undefined,
    outboxJobId: outboxJobId as string | null | undefined,
    serverQuoteId: serverQuoteId as string | null | undefined,
    extractJobId: extractJobId as string | null | undefined,
    lastFailureKind: (lastFailureKind as SubmitFailureKind | null | undefined) ?? null,
    lastError: (lastError as string | null | undefined) ?? null,
    createdAt,
    updatedAt,
    lastOpenedAt: lastOpenedAt as string | undefined,
  };
}

export function parseStoredSyncEvent(value: unknown): LocalSyncEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  const { eventId, sessionId, userId, level, message, createdAt } = value;
  if (
    typeof eventId !== "string" ||
    typeof sessionId !== "string" ||
    typeof userId !== "string" ||
    typeof level !== "string" ||
    typeof message !== "string" ||
    typeof createdAt !== "string"
  ) {
    return null;
  }

  if (!SYNC_EVENT_LEVELS.has(level as LocalSyncEvent["level"])) {
    return null;
  }

  return {
    eventId,
    sessionId,
    userId,
    level: level as LocalSyncEvent["level"],
    message,
    createdAt,
  };
}

function parseCustomerSnapshot(value: unknown): LocalCaptureSession["customerSnapshot"] | undefined {
  if (value === undefined || value === null) {
    return value as LocalCaptureSession["customerSnapshot"];
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const { name, email, phone, address } = value;
  if (
    (name !== undefined && typeof name !== "string") ||
    (email !== undefined && typeof email !== "string") ||
    (phone !== undefined && typeof phone !== "string") ||
    (address !== undefined && typeof address !== "string")
  ) {
    return undefined;
  }

  return { name, email, phone, address };
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

export function buildLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}
