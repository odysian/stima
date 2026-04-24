import { CAPTURE_STORE_NAMES, getDb } from "@/features/quotes/offline/captureDb";
import { deleteAllClipsForSession } from "@/features/quotes/offline/audioRepository";
import type {
  CreateLocalCaptureInput,
  CreateLocalSyncEventInput,
  LocalCaptureSession,
  LocalCaptureStatus,
  LocalCaptureSummary,
  LocalSyncEvent,
  SubmitFailureKind,
} from "@/features/quotes/offline/captureTypes";

const ABANDONED_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RECOVERABLE_CAPTURE_STATUSES = new Set<LocalCaptureStatus>([
  "local_only",
  "ready_to_extract",
  "submitting",
  "extract_failed",
]);
const CAPTURE_STATUSES = new Set<LocalCaptureStatus>([
  "local_only",
  "ready_to_extract",
  "submitting",
  "extract_failed",
  "synced",
  "discarded",
]);
const SYNC_EVENT_LEVELS = new Set<LocalSyncEvent["level"]>(["info", "warning", "error"]);
const SUBMIT_FAILURE_KINDS = new Set<SubmitFailureKind>([
  "offline",
  "timeout",
  "auth_required",
  "csrf_failed",
  "validation_failed",
  "server_retryable",
  "server_terminal",
]);
const IMMUTABLE_CAPTURE_FIELDS = new Set<keyof LocalCaptureSession>(["sessionId", "createdAt"]);

type UnknownRecord = Record<string, unknown>;

export async function createCaptureSession(
  input: CreateLocalCaptureInput,
): Promise<LocalCaptureSession> {
  const now = new Date().toISOString();
  const session: LocalCaptureSession = {
    sessionId: buildLocalId(),
    userId: input.userId,
    status: "local_only",
    notes: input.notes ?? "",
    customerId: input.customerId ?? null,
    customerSnapshot: input.customerSnapshot ?? null,
    clipIds: [],
    idempotencyKey: null,
    outboxJobId: null,
    serverQuoteId: null,
    extractJobId: null,
    lastFailureKind: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };

  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.captureSessions, "readwrite");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.captureSessions);
  store.put(session);
  await transactionDone(transaction);
  return session;
}

export async function getCaptureSession(sessionId: string): Promise<LocalCaptureSession | null> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.captureSessions, "readonly");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.captureSessions);
  const rawRecord = await requestToPromise(store.get(sessionId));
  await transactionDone(transaction);
  return parseStoredCapture(rawRecord);
}

export async function updateCaptureNotes(sessionId: string, notes: string): Promise<void> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.captureSessions, "readwrite");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.captureSessions);
  const session = await getWritableCaptureSession(store, sessionId);
  session.notes = notes;
  session.updatedAt = new Date().toISOString();
  store.put(session);
  await transactionDone(transaction);
}

export async function updateCaptureField(
  sessionId: string,
  patch: Partial<LocalCaptureSession>,
): Promise<void> {
  validateCapturePatch(patch);
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.captureSessions, "readwrite");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.captureSessions);
  const session = await getWritableCaptureSession(store, sessionId);
  const mutablePatch = Object.entries(patch).filter(([key, value]) => {
    return value !== undefined && !IMMUTABLE_CAPTURE_FIELDS.has(key as keyof LocalCaptureSession);
  });

  for (const [key, value] of mutablePatch as Array<
    [keyof LocalCaptureSession, LocalCaptureSession[keyof LocalCaptureSession]]
  >) {
    session[key] = value as never;
  }
  session.updatedAt = new Date().toISOString();
  store.put(session);
  await transactionDone(transaction);
}

function validateCapturePatch(patch: Partial<LocalCaptureSession>): void {
  if (
    patch.status !== undefined &&
    (typeof patch.status !== "string" || !CAPTURE_STATUSES.has(patch.status as LocalCaptureStatus))
  ) {
    throw new Error(`Invalid capture status patch: ${String(patch.status)}`);
  }

  if (
    patch.lastFailureKind !== undefined &&
    patch.lastFailureKind !== null &&
    (typeof patch.lastFailureKind !== "string" ||
      !SUBMIT_FAILURE_KINDS.has(patch.lastFailureKind as SubmitFailureKind))
  ) {
    throw new Error(`Invalid capture failure kind patch: ${String(patch.lastFailureKind)}`);
  }
}

export async function listRecoverableCaptures(userId: string): Promise<LocalCaptureSummary[]> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.captureSessions, "readonly");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.captureSessions);
  const userIndex = store.index("userId");
  const records = await requestToPromise(userIndex.getAll(IDBKeyRange.only(userId)));
  await transactionDone(transaction);

  const summaries = records
    .map(parseStoredCapture)
    .filter((record): record is LocalCaptureSession => record !== null)
    .filter((record) => record.userId === userId && RECOVERABLE_CAPTURE_STATUSES.has(record.status))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((record) => ({
      sessionId: record.sessionId,
      status: record.status,
      notes: record.notes,
      updatedAt: record.updatedAt,
      lastFailureKind: record.lastFailureKind ?? null,
      lastError: record.lastError ?? null,
    }));

  return summaries;
}

export async function markCaptureStatus(
  sessionId: string,
  status: LocalCaptureStatus,
  options?: { failureKind?: SubmitFailureKind; error?: string },
): Promise<void> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.captureSessions, "readwrite");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.captureSessions);
  const session = await getWritableCaptureSession(store, sessionId);

  session.status = status;
  session.lastFailureKind = options?.failureKind ?? null;
  session.lastError = options?.error ?? null;
  session.updatedAt = new Date().toISOString();

  store.put(session);
  await transactionDone(transaction);
}

export async function deleteCaptureSession(sessionId: string): Promise<void> {
  await deleteAllClipsForSession(sessionId);
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.captureSessions, "readwrite");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.captureSessions);
  store.delete(sessionId);
  await transactionDone(transaction);
}

export async function deleteEmptyAbandonedSessions(userId: string): Promise<void> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.captureSessions, "readwrite");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.captureSessions);
  const userIndex = store.index("userId");
  const records = await requestToPromise(userIndex.getAll(IDBKeyRange.only(userId)));
  const nowMs = Date.now();

  for (const rawRecord of records) {
    const session = parseStoredCapture(rawRecord);
    if (!session) {
      continue;
    }

    const updatedAtMs = Date.parse(session.updatedAt);
    if (Number.isNaN(updatedAtMs)) {
      continue;
    }

    const isOldEnough = nowMs - updatedAtMs >= ABANDONED_SESSION_MAX_AGE_MS;
    const hasNoNotes = session.notes.trim().length === 0;
    const hasNoClips = session.clipIds.length === 0;
    const isLocalOnly = session.status === "local_only";

    if (isOldEnough && hasNoNotes && hasNoClips && isLocalOnly) {
      store.delete(session.sessionId);
    }
  }

  await transactionDone(transaction);
}

export async function appendSyncEvent(event: CreateLocalSyncEventInput): Promise<void> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.syncEvents, "readwrite");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.syncEvents);
  const syncEvent: LocalSyncEvent = {
    eventId: buildLocalId(),
    createdAt: new Date().toISOString(),
    ...event,
  };
  store.put(syncEvent);
  await transactionDone(transaction);
}

export async function listSyncEvents(sessionId: string): Promise<LocalSyncEvent[]> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.syncEvents, "readonly");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.syncEvents);
  const sessionIndex = store.index("sessionId");
  const records = await requestToPromise(sessionIndex.getAll(IDBKeyRange.only(sessionId)));
  await transactionDone(transaction);

  return records
    .map(parseStoredSyncEvent)
    .filter((record): record is LocalSyncEvent => record !== null)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function getWritableCaptureSession(
  store: IDBObjectStore,
  sessionId: string,
): Promise<LocalCaptureSession> {
  const rawRecord = await requestToPromise(store.get(sessionId));
  if (rawRecord === undefined) {
    throw new Error(`Capture session not found: ${sessionId}`);
  }

  const parsedRecord = parseStoredCapture(rawRecord);
  if (!parsedRecord) {
    throw new Error(`Stored capture session is invalid: ${sessionId}`);
  }

  return parsedRecord;
}

function parseStoredCapture(value: unknown): LocalCaptureSession | null {
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

function parseStoredSyncEvent(value: unknown): LocalSyncEvent | null {
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
