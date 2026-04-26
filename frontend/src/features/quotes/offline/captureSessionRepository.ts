import { CAPTURE_STORE_NAMES, getDb } from "@/features/quotes/offline/captureDb";
import { deleteAllClipsForSession } from "@/features/quotes/offline/audioRepository";
import { dispatchLocalRecoveryChanged } from "@/features/quotes/offline/localRecoveryEvents";
import { deleteJobForSession } from "@/features/quotes/offline/outboxRepository";
import {
  buildLocalId,
  CAPTURE_STATUSES,
  IMMUTABLE_CAPTURE_FIELDS,
  parseStoredCapture,
  requestToPromise,
  SUBMIT_FAILURE_KINDS,
  transactionDone,
} from "@/features/quotes/offline/captureRepositoryShared";
import type {
  CreateLocalCaptureInput,
  LocalCaptureSession,
  LocalCaptureStatus,
  LocalCaptureSummary,
  SubmitFailureKind,
} from "@/features/quotes/offline/captureTypes";

const ABANDONED_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RECOVERABLE_SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const SYNCED_AUDIO_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CAPTURE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const RECOVERABLE_CAPTURE_STATUSES = new Set<LocalCaptureStatus>([
  "local_only",
  "ready_to_extract",
  "submitting",
  "extract_failed",
]);
const lastCleanupRunAtByUser = new Map<string, number>();

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
  dispatchLocalRecoveryChanged({
    userId: session.userId,
    sessionId: session.sessionId,
    reason: "capture_saved",
  });
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
  dispatchLocalRecoveryChanged({
    userId: session.userId,
    sessionId,
    reason: "capture_saved",
  });
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
  dispatchLocalRecoveryChanged({
    userId: session.userId,
    sessionId,
    reason: "capture_saved",
  });
}

export async function listRecoverableCaptures(userId: string): Promise<LocalCaptureSummary[]> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.captureSessions, "readonly");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.captureSessions);
  const userIndex = store.index("userId");
  const records = await requestToPromise(userIndex.getAll(IDBKeyRange.only(userId)));
  await transactionDone(transaction);

  const parsedRecords = records
    .map(parseStoredCapture)
    .filter((record): record is LocalCaptureSession => record !== null);

  const retainedRecords = await runScheduledCaptureCleanup(userId, parsedRecords);

  return retainedRecords
    .filter((record) => record.userId === userId && RECOVERABLE_CAPTURE_STATUSES.has(record.status))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((record) => ({
      sessionId: record.sessionId,
      status: record.status,
      notes: record.notes,
      customerId: record.customerId ?? null,
      customerSnapshot: record.customerSnapshot ?? null,
      clipCount: record.clipIds.length,
      updatedAt: record.updatedAt,
      lastFailureKind: record.lastFailureKind ?? null,
      lastError: record.lastError ?? null,
    }));
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
  dispatchLocalRecoveryChanged({
    userId: session.userId,
    sessionId,
    reason: "capture_saved",
  });
}

export async function deleteCaptureSession(sessionId: string): Promise<void> {
  const session = await getCaptureSession(sessionId);
  await deleteAllClipsForSession(sessionId);
  await deleteJobForSession(sessionId);
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.captureSessions, "readwrite");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.captureSessions);
  store.delete(sessionId);
  await transactionDone(transaction);
  if (!session) {
    return;
  }
  dispatchLocalRecoveryChanged({
    userId: session.userId,
    sessionId,
    reason: "capture_deleted",
  });
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

async function runScheduledCaptureCleanup(
  userId: string,
  records: LocalCaptureSession[],
): Promise<LocalCaptureSession[]> {
  const nowMs = Date.now();
  const lastCleanupRunAt = lastCleanupRunAtByUser.get(userId);
  if (
    lastCleanupRunAt !== undefined &&
    nowMs - lastCleanupRunAt < CAPTURE_CLEANUP_INTERVAL_MS
  ) {
    return records;
  }

  lastCleanupRunAtByUser.set(userId, nowMs);
  return cleanupExpiredCaptures(userId, records, nowMs);
}

async function cleanupExpiredCaptures(
  userId: string,
  records: LocalCaptureSession[],
  nowMs: number,
): Promise<LocalCaptureSession[]> {
  const staleRecoverableSessionIds = new Set<string>();
  const syncedSessionsNeedingAudioCleanup: LocalCaptureSession[] = [];

  for (const record of records) {
    if (record.userId !== userId) {
      continue;
    }

    const updatedAtMs = Date.parse(record.updatedAt);
    if (Number.isNaN(updatedAtMs)) {
      continue;
    }

    const ageMs = nowMs - updatedAtMs;
    if (ageMs >= RECOVERABLE_SESSION_MAX_AGE_MS) {
      staleRecoverableSessionIds.add(record.sessionId);
      continue;
    }

    if (
      record.status === "synced" &&
      record.clipIds.length > 0 &&
      ageMs >= SYNCED_AUDIO_RETENTION_MS
    ) {
      syncedSessionsNeedingAudioCleanup.push(record);
    }
  }

  for (const sessionId of staleRecoverableSessionIds) {
    try {
      await deleteCaptureSession(sessionId);
    } catch {
      // Best-effort cleanup should not block capture listing.
    }
  }

  for (const syncedSession of syncedSessionsNeedingAudioCleanup) {
    try {
      await deleteAllClipsForSession(syncedSession.sessionId);
      await updateCaptureField(syncedSession.sessionId, { clipIds: [] });
      syncedSession.clipIds = [];
    } catch {
      // Best-effort cleanup should not block capture listing.
    }
  }

  return records.filter((record) => !staleRecoverableSessionIds.has(record.sessionId));
}
