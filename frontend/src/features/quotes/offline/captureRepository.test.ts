import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CAPTURE_DB_VERSION,
  CAPTURE_STORE_NAMES,
  getDb,
  resetCaptureDbForTests,
} from "@/features/quotes/offline/captureDb";
import {
  appendSyncEvent,
  createCaptureSession,
  deleteCaptureSession,
  deleteEmptyAbandonedSessions,
  getCaptureSession,
  listRecoverableCaptures,
  listSyncEvents,
  markCaptureStatus,
  updateCaptureField,
  updateCaptureNotes,
} from "@/features/quotes/offline/captureRepository";
import { getAudioClip, saveAudioClip } from "@/features/quotes/offline/audioRepository";
import type { LocalCaptureSession } from "@/features/quotes/offline/captureTypes";
import { getStorageEstimate, isStoragePressured } from "@/features/quotes/offline/storageHealth";

const ORIGINAL_NAVIGATOR_STORAGE_DESCRIPTOR = Object.getOwnPropertyDescriptor(window.navigator, "storage");

describe("captureDb schema", () => {
  beforeEach(async () => {
    await resetCaptureDbForTests();
  });

  afterEach(async () => {
    restoreNavigatorStorage();
    await resetCaptureDbForTests();
  });

  it("opens schema v1 with all required stores", async () => {
    const db = await getDb();

    expect(db.version).toBe(CAPTURE_DB_VERSION);
    expect(db.objectStoreNames.contains(CAPTURE_STORE_NAMES.captureSessions)).toBe(true);
    expect(db.objectStoreNames.contains(CAPTURE_STORE_NAMES.syncEvents)).toBe(true);
    expect(db.objectStoreNames.contains(CAPTURE_STORE_NAMES.audioClips)).toBe(true);
    expect(db.objectStoreNames.contains(CAPTURE_STORE_NAMES.localDrafts)).toBe(true);
    expect(db.objectStoreNames.contains(CAPTURE_STORE_NAMES.outboxJobs)).toBe(true);
  });
});

describe("captureRepository", () => {
  beforeEach(async () => {
    await resetCaptureDbForTests();
  });

  afterEach(async () => {
    restoreNavigatorStorage();
    await resetCaptureDbForTests();
  });

  it("creates and loads capture sessions", async () => {
    const session = await createCaptureSession({
      userId: "user-a",
      notes: "roof quote",
      customerId: "customer-1",
    });
    const loadedSession = await getCaptureSession(session.sessionId);

    expect(session.status).toBe("local_only");
    expect(session.clipIds).toEqual([]);
    expect(loadedSession).toEqual(session);
  });

  it("returns null for unknown capture session", async () => {
    const loadedSession = await getCaptureSession("missing-session");
    expect(loadedSession).toBeNull();
  });

  it("updates notes and updatedAt while preserving other fields", async () => {
    const session = await createCaptureSession({
      userId: "user-a",
      notes: "first note",
      customerId: "customer-1",
    });
    const createdAt = session.createdAt;
    const firstUpdatedAt = session.updatedAt;

    await new Promise((resolve) => setTimeout(resolve, 2));
    await updateCaptureNotes(session.sessionId, "edited note");

    const updatedSession = await getCaptureSession(session.sessionId);
    expect(updatedSession).not.toBeNull();
    expect(updatedSession?.notes).toBe("edited note");
    expect(updatedSession?.customerId).toBe("customer-1");
    expect(updatedSession?.createdAt).toBe(createdAt);
    expect(updatedSession?.updatedAt).not.toBe(firstUpdatedAt);
  });

  it("throws when updating notes for a missing session", async () => {
    await expect(updateCaptureNotes("missing-session", "new notes")).rejects.toThrowError(
      "Capture session not found: missing-session",
    );
  });

  it("updates arbitrary mutable fields without changing immutable fields", async () => {
    const session = await createCaptureSession({
      userId: "user-a",
      notes: "first note",
    });

    await updateCaptureField(session.sessionId, {
      status: "ready_to_extract",
      notes: "patched note",
      sessionId: "do-not-change",
      createdAt: "do-not-change",
      customerSnapshot: { name: "Ada Lovelace" },
    });

    const updatedSession = await getCaptureSession(session.sessionId);
    expect(updatedSession).not.toBeNull();
    expect(updatedSession?.sessionId).toBe(session.sessionId);
    expect(updatedSession?.createdAt).toBe(session.createdAt);
    expect(updatedSession?.status).toBe("ready_to_extract");
    expect(updatedSession?.notes).toBe("patched note");
    expect(updatedSession?.customerSnapshot).toEqual({ name: "Ada Lovelace" });
  });

  it("throws when updating fields for a missing session", async () => {
    await expect(updateCaptureField("missing-session", { notes: "new notes" })).rejects.toThrowError(
      "Capture session not found: missing-session",
    );
  });

  it("rejects invalid enumerated patch values", async () => {
    const session = await createCaptureSession({
      userId: "user-a",
      notes: "first note",
    });

    await expect(
      updateCaptureField(session.sessionId, {
        status: "invalid" as unknown as LocalCaptureSession["status"],
      }),
    ).rejects.toThrowError("Invalid capture status patch: invalid");

    await expect(
      updateCaptureField(session.sessionId, {
        lastFailureKind: "not-a-kind" as unknown as LocalCaptureSession["lastFailureKind"],
      }),
    ).rejects.toThrowError("Invalid capture failure kind patch: not-a-kind");

    const loadedSession = await getCaptureSession(session.sessionId);
    expect(loadedSession?.status).toBe("local_only");
    expect(loadedSession?.lastFailureKind).toBeNull();
  });

  it("lists only recoverable captures for the requested user", async () => {
    const keepOne = await createCaptureSession({
      userId: "user-a",
      notes: "keep",
    });
    const syncedSession = await createCaptureSession({
      userId: "user-a",
      notes: "already synced",
    });
    await markCaptureStatus(syncedSession.sessionId, "synced");
    await createCaptureSession({
      userId: "user-b",
      notes: "other user",
    });

    const recoverable = await listRecoverableCaptures("user-a");

    expect(recoverable).toHaveLength(1);
    expect(recoverable[0]?.sessionId).toBe(keepOne.sessionId);
    expect(recoverable[0]?.status).toBe("local_only");
  });

  it("applies failure metadata when marking capture status", async () => {
    const session = await createCaptureSession({
      userId: "user-a",
      notes: "capture",
    });

    await markCaptureStatus(session.sessionId, "extract_failed", {
      failureKind: "timeout",
      error: "request timed out",
    });

    const updatedSession = await getCaptureSession(session.sessionId);
    expect(updatedSession?.status).toBe("extract_failed");
    expect(updatedSession?.lastFailureKind).toBe("timeout");
    expect(updatedSession?.lastError).toBe("request timed out");
  });

  it("deletes capture session records", async () => {
    const session = await createCaptureSession({
      userId: "user-a",
      notes: "to delete",
    });
    await saveAudioClip({
      clipId: "clip-1",
      sessionId: session.sessionId,
      userId: "user-a",
      blob: new Blob(["clip-a"], { type: "audio/webm" }),
      mimeType: "audio/webm",
      sizeBytes: 6,
      durationSeconds: 3,
      sequenceNumber: 1,
    });

    await deleteCaptureSession(session.sessionId);

    expect(await getCaptureSession(session.sessionId)).toBeNull();
    expect(await getAudioClip("clip-1")).toBeNull();
  });

  it("deletes only empty abandoned local-only sessions", async () => {
    const now = Date.now();
    const staleTimestamp = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
    const freshTimestamp = new Date(now - 30 * 60 * 1000).toISOString();

    await putCaptureSessionRecord({
      sessionId: "stale-empty",
      userId: "user-a",
      status: "local_only",
      notes: "",
      clipIds: [],
      createdAt: staleTimestamp,
      updatedAt: staleTimestamp,
    });
    await putCaptureSessionRecord({
      sessionId: "stale-with-notes",
      userId: "user-a",
      status: "local_only",
      notes: "do not remove",
      clipIds: [],
      createdAt: staleTimestamp,
      updatedAt: staleTimestamp,
    });
    await putCaptureSessionRecord({
      sessionId: "fresh-empty",
      userId: "user-a",
      status: "local_only",
      notes: "",
      clipIds: [],
      createdAt: freshTimestamp,
      updatedAt: freshTimestamp,
    });

    await deleteEmptyAbandonedSessions("user-a");

    expect(await getCaptureSession("stale-empty")).toBeNull();
    expect(await getCaptureSession("stale-with-notes")).not.toBeNull();
    expect(await getCaptureSession("fresh-empty")).not.toBeNull();
  });

  it("ignores corrupt records when listing recoverable captures", async () => {
    await putCaptureSessionRecord({
      sessionId: "good-session",
      userId: "user-a",
      status: "local_only",
      notes: "",
      clipIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await putRawCaptureSessionRecord({
      sessionId: "corrupt-session",
      userId: "user-a",
      status: "local_only",
      notes: 42,
      clipIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const recoverable = await listRecoverableCaptures("user-a");

    expect(recoverable).toHaveLength(1);
    expect(recoverable[0]?.sessionId).toBe("good-session");
  });

  it("appends and lists sync events per session", async () => {
    await appendSyncEvent({
      sessionId: "session-a",
      userId: "user-a",
      level: "info",
      message: "queued",
    });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await appendSyncEvent({
      sessionId: "session-a",
      userId: "user-a",
      level: "warning",
      message: "retrying",
    });
    await appendSyncEvent({
      sessionId: "session-b",
      userId: "user-a",
      level: "error",
      message: "different session",
    });

    const events = await listSyncEvents("session-a");

    expect(events).toHaveLength(2);
    expect(events[0]?.message).toBe("queued");
    expect(events[1]?.message).toBe("retrying");
  });
});

describe("storageHealth", () => {
  beforeEach(async () => {
    await resetCaptureDbForTests();
  });

  afterEach(async () => {
    restoreNavigatorStorage();
    await resetCaptureDbForTests();
  });

  it("returns null estimate values when navigator.storage is unavailable", async () => {
    setNavigatorStorage(undefined);

    await expect(getStorageEstimate()).resolves.toEqual({
      usedBytes: null,
      quotaBytes: null,
      percentUsed: null,
    });
  });

  it("returns usage values from navigator.storage.estimate", async () => {
    setNavigatorStorage({
      estimate: async () => ({ usage: 250, quota: 1000 }),
    } as StorageManager);

    await expect(getStorageEstimate()).resolves.toEqual({
      usedBytes: 250,
      quotaBytes: 1000,
      percentUsed: 25,
    });
  });

  it("reports pressure state using the threshold", async () => {
    setNavigatorStorage({
      estimate: async () => ({ usage: 850, quota: 1000 }),
    } as StorageManager);

    await expect(isStoragePressured()).resolves.toBe(true);
    await expect(isStoragePressured(90)).resolves.toBe(false);
  });
});

async function putCaptureSessionRecord(
  patch: Pick<LocalCaptureSession, "sessionId" | "userId" | "status" | "notes" | "clipIds" | "createdAt" | "updatedAt">,
): Promise<void> {
  await putRawCaptureSessionRecord({
    ...patch,
    customerId: null,
    customerSnapshot: null,
    idempotencyKey: null,
    outboxJobId: null,
    serverQuoteId: null,
    extractJobId: null,
    lastFailureKind: null,
    lastError: null,
  });
}

async function putRawCaptureSessionRecord(record: unknown): Promise<void> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.captureSessions, "readwrite");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.captureSessions);
  store.put(record);
  await transactionDone(transaction);
}

function setNavigatorStorage(storageManager: StorageManager | undefined): void {
  Object.defineProperty(window.navigator, "storage", {
    configurable: true,
    writable: true,
    value: storageManager,
  });
}

function restoreNavigatorStorage(): void {
  if (ORIGINAL_NAVIGATOR_STORAGE_DESCRIPTOR) {
    Object.defineProperty(window.navigator, "storage", ORIGINAL_NAVIGATOR_STORAGE_DESCRIPTOR);
    return;
  }

  Reflect.deleteProperty(window.navigator, "storage");
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}
