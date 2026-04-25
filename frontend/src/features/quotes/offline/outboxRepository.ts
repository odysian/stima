import { CAPTURE_STORE_NAMES, getDb } from "@/features/quotes/offline/captureDb";
import type {
  EnqueueJobInput,
  OutboxJob,
  OutboxJobStatus,
  SubmitFailureKind,
} from "@/features/quotes/offline/captureTypes";

const DEFAULT_MAX_ATTEMPTS = 5;
const ACTIVE_STATUSES = new Set<OutboxJobStatus>(["queued", "running", "failed_retryable"]);
const OUTBOX_STATUSES = new Set<OutboxJobStatus>([
  "queued",
  "running",
  "succeeded",
  "failed_retryable",
  "failed_terminal",
]);
const SUBMIT_FAILURE_KINDS = new Set<SubmitFailureKind>([
  "offline",
  "timeout",
  "auth_required",
  "csrf_failed",
  "validation_failed",
  "server_retryable",
  "server_terminal",
]);

type UnknownRecord = Record<string, unknown>;

export async function enqueueJob(input: EnqueueJobInput): Promise<OutboxJob> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.outboxJobs, "readwrite");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.outboxJobs);

  const existingForSession = await listJobsForSessionFromStore(store, input.sessionId);
  const activeJob = existingForSession.find((job) => ACTIVE_STATUSES.has(job.status));
  if (activeJob) {
    activeJob.idempotencyKey = input.idempotencyKey;
    activeJob.maxAttempts = normalizeMaxAttempts(input.maxAttempts ?? activeJob.maxAttempts);
    activeJob.updatedAt = new Date().toISOString();
    store.put(activeJob);
    await transactionDone(transaction);
    return activeJob;
  }

  const now = new Date().toISOString();
  const createdJob: OutboxJob = {
    jobId: buildLocalId(),
    userId: input.userId,
    sessionId: input.sessionId,
    idempotencyKey: input.idempotencyKey,
    status: "queued",
    attemptCount: 0,
    maxAttempts: normalizeMaxAttempts(input.maxAttempts),
    nextRetryAt: null,
    lastFailureKind: null,
    lastError: null,
    serverQuoteId: null,
    serverJobId: null,
    createdAt: now,
    updatedAt: now,
  };

  store.put(createdJob);
  await transactionDone(transaction);
  return createdJob;
}

export async function getJob(jobId: string): Promise<OutboxJob | null> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.outboxJobs, "readonly");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.outboxJobs);
  const rawRecord = await requestToPromise(store.get(jobId));
  await transactionDone(transaction);
  return parseStoredOutboxJob(rawRecord);
}

export async function getJobForSession(sessionId: string): Promise<OutboxJob | null> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.outboxJobs, "readonly");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.outboxJobs);
  const records = await listJobsForSessionFromStore(store, sessionId);
  await transactionDone(transaction);

  if (records.length === 0) {
    return null;
  }

  const activeJob = records.find((job) => ACTIVE_STATUSES.has(job.status));
  if (activeJob) {
    return activeJob;
  }

  return records[0] ?? null;
}

export async function updateJobStatus(jobId: string, patch: Partial<OutboxJob>): Promise<void> {
  validateOutboxPatch(patch);

  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.outboxJobs, "readwrite");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.outboxJobs);
  const job = await getWritableOutboxJob(store, jobId);

  if (patch.userId !== undefined) {
    job.userId = patch.userId;
  }
  if (patch.sessionId !== undefined) {
    job.sessionId = patch.sessionId;
  }
  if (patch.idempotencyKey !== undefined) {
    job.idempotencyKey = patch.idempotencyKey;
  }
  if (patch.status !== undefined) {
    job.status = patch.status;
  }
  if (patch.attemptCount !== undefined) {
    job.attemptCount = patch.attemptCount;
  }
  if (patch.maxAttempts !== undefined) {
    job.maxAttempts = normalizeMaxAttempts(patch.maxAttempts);
  }
  if (patch.nextRetryAt !== undefined) {
    job.nextRetryAt = patch.nextRetryAt;
  }
  if (patch.lastFailureKind !== undefined) {
    job.lastFailureKind = patch.lastFailureKind;
  }
  if (patch.lastError !== undefined) {
    job.lastError = patch.lastError;
  }
  if (patch.serverQuoteId !== undefined) {
    job.serverQuoteId = patch.serverQuoteId;
  }
  if (patch.serverJobId !== undefined) {
    job.serverJobId = patch.serverJobId;
  }

  job.updatedAt = new Date().toISOString();
  store.put(job);
  await transactionDone(transaction);
}

export async function listPendingJobs(userId: string): Promise<OutboxJob[]> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.outboxJobs, "readonly");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.outboxJobs);
  const userIndex = store.index("userId");
  const records = await requestToPromise(userIndex.getAll(IDBKeyRange.only(userId)));
  await transactionDone(transaction);

  const nowMs = Date.now();
  return records
    .map(parseStoredOutboxJob)
    .filter((record): record is OutboxJob => record !== null)
    .filter((record) => {
      if (record.userId !== userId) {
        return false;
      }

      if (record.status === "queued") {
        return true;
      }

      if (record.status !== "failed_retryable") {
        return false;
      }

      if (record.lastFailureKind === "auth_required") {
        return false;
      }

      if (!record.nextRetryAt) {
        return true;
      }

      const nextRetryAtMs = Date.parse(record.nextRetryAt);
      return Number.isFinite(nextRetryAtMs) && nextRetryAtMs <= nowMs;
    })
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
}

export async function listAllJobsForUser(userId: string): Promise<OutboxJob[]> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.outboxJobs, "readonly");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.outboxJobs);
  const userIndex = store.index("userId");
  const records = await requestToPromise(userIndex.getAll(IDBKeyRange.only(userId)));
  await transactionDone(transaction);

  return records
    .map(parseStoredOutboxJob)
    .filter((record): record is OutboxJob => record !== null)
    .filter((record) => record.userId === userId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function deleteJob(jobId: string): Promise<void> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.outboxJobs, "readwrite");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.outboxJobs);
  store.delete(jobId);
  await transactionDone(transaction);
}

export async function deleteJobForSession(sessionId: string): Promise<void> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.outboxJobs, "readwrite");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.outboxJobs);

  const jobs = await listJobsForSessionFromStore(store, sessionId);
  for (const job of jobs) {
    store.delete(job.jobId);
  }

  await transactionDone(transaction);
}

async function listJobsForSessionFromStore(
  store: IDBObjectStore,
  sessionId: string,
): Promise<OutboxJob[]> {
  const sessionIndex = store.index("sessionId");
  const records = await requestToPromise(sessionIndex.getAll(IDBKeyRange.only(sessionId)));

  return records
    .map(parseStoredOutboxJob)
    .filter((record): record is OutboxJob => record !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function validateOutboxPatch(patch: Partial<OutboxJob>): void {
  if (
    patch.status !== undefined
    && (typeof patch.status !== "string" || !OUTBOX_STATUSES.has(patch.status as OutboxJobStatus))
  ) {
    throw new Error(`Invalid outbox status patch: ${String(patch.status)}`);
  }

  if (
    patch.lastFailureKind !== undefined
    && patch.lastFailureKind !== null
    && (typeof patch.lastFailureKind !== "string"
      || !SUBMIT_FAILURE_KINDS.has(patch.lastFailureKind as SubmitFailureKind))
  ) {
    throw new Error(`Invalid outbox failure kind patch: ${String(patch.lastFailureKind)}`);
  }

  if (patch.maxAttempts !== undefined && (!Number.isFinite(patch.maxAttempts) || patch.maxAttempts < 1)) {
    throw new Error(`Invalid outbox maxAttempts patch: ${String(patch.maxAttempts)}`);
  }

  if (patch.attemptCount !== undefined && (!Number.isFinite(patch.attemptCount) || patch.attemptCount < 0)) {
    throw new Error(`Invalid outbox attemptCount patch: ${String(patch.attemptCount)}`);
  }

  if (
    patch.nextRetryAt !== undefined
    && patch.nextRetryAt !== null
    && (typeof patch.nextRetryAt !== "string" || Number.isNaN(Date.parse(patch.nextRetryAt)))
  ) {
    throw new Error(`Invalid outbox nextRetryAt patch: ${String(patch.nextRetryAt)}`);
  }
}

async function getWritableOutboxJob(store: IDBObjectStore, jobId: string): Promise<OutboxJob> {
  const rawRecord = await requestToPromise(store.get(jobId));
  if (rawRecord === undefined) {
    throw new Error(`Outbox job not found: ${jobId}`);
  }

  const parsedRecord = parseStoredOutboxJob(rawRecord);
  if (!parsedRecord) {
    throw new Error(`Stored outbox job is invalid: ${jobId}`);
  }

  return parsedRecord;
}

function parseStoredOutboxJob(value: unknown): OutboxJob | null {
  if (!isRecord(value)) {
    return null;
  }

  const jobId = value.jobId;
  const userId = value.userId;
  const sessionId = value.sessionId;
  const idempotencyKey = value.idempotencyKey;
  const status = value.status;
  const attemptCount = value.attemptCount;
  const maxAttempts = value.maxAttempts;
  const nextRetryAt = value.nextRetryAt;
  const lastFailureKind = value.lastFailureKind;
  const lastError = value.lastError;
  const serverQuoteId = value.serverQuoteId;
  const serverJobId = value.serverJobId;
  const createdAt = value.createdAt;
  const updatedAt = value.updatedAt;

  if (
    typeof jobId !== "string"
    || typeof userId !== "string"
    || typeof sessionId !== "string"
    || typeof idempotencyKey !== "string"
    || typeof status !== "string"
    || !OUTBOX_STATUSES.has(status as OutboxJobStatus)
    || !Number.isFinite(attemptCount)
    || !Number.isFinite(maxAttempts)
    || !isOptionalNullableString(nextRetryAt)
    || !isOptionalNullableString(lastError)
    || !isOptionalNullableString(serverQuoteId)
    || !isOptionalNullableString(serverJobId)
    || typeof createdAt !== "string"
    || typeof updatedAt !== "string"
  ) {
    return null;
  }

  if (
    lastFailureKind !== undefined
    && lastFailureKind !== null
    && (typeof lastFailureKind !== "string"
      || !SUBMIT_FAILURE_KINDS.has(lastFailureKind as SubmitFailureKind))
  ) {
    return null;
  }

  if (nextRetryAt !== undefined && nextRetryAt !== null && Number.isNaN(Date.parse(nextRetryAt as string))) {
    return null;
  }

  return {
    jobId,
    userId,
    sessionId,
    idempotencyKey,
    status: status as OutboxJobStatus,
    attemptCount: attemptCount as number,
    maxAttempts: maxAttempts as number,
    nextRetryAt: (nextRetryAt as string | null | undefined) ?? null,
    lastFailureKind: (lastFailureKind as SubmitFailureKind | null | undefined) ?? null,
    lastError: (lastError as string | null | undefined) ?? null,
    serverQuoteId: (serverQuoteId as string | null | undefined) ?? null,
    serverJobId: (serverJobId as string | null | undefined) ?? null,
    createdAt,
    updatedAt,
  };
}

function normalizeMaxAttempts(maxAttempts: number | undefined): number {
  if (!Number.isFinite(maxAttempts) || (maxAttempts ?? 0) < 1) {
    return DEFAULT_MAX_ATTEMPTS;
  }
  return maxAttempts as number;
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function buildLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}
