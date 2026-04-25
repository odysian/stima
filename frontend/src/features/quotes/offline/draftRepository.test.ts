import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CAPTURE_STORE_NAMES, getDb, resetCaptureDbForTests } from "@/features/quotes/offline/captureDb";
import {
  buildDocumentDraftKey,
  clearDraftsForUser,
  deleteLocalDraft,
  deleteStaleLocalDrafts,
  getLocalDraft,
  listDraftsForUser,
  saveLocalDraft,
  type LocalDraft,
} from "@/features/quotes/offline/draftRepository";

describe("draftRepository", () => {
  beforeEach(async () => {
    await resetCaptureDbForTests();
  });

  afterEach(async () => {
    await resetCaptureDbForTests();
  });

  it("saves and loads drafts by key + user", async () => {
    await saveLocalDraft({
      draftKey: buildDocumentDraftKey("doc-1", "quote"),
      userId: "user-a",
      docType: "quote",
      documentId: "doc-1",
      payload: { title: "Quote Draft" },
    });

    await expect(getLocalDraft(buildDocumentDraftKey("doc-1", "quote"), "user-a")).resolves.toEqual(
      expect.objectContaining({
        draftKey: "doc-1:quote",
        userId: "user-a",
        docType: "quote",
        documentId: "doc-1",
        payload: { title: "Quote Draft" },
      }),
    );
  });

  it("returns null for unknown keys and wrong users", async () => {
    await saveLocalDraft({
      draftKey: buildDocumentDraftKey("doc-1", "invoice"),
      userId: "user-a",
      docType: "invoice",
      documentId: "doc-1",
      payload: { title: "Invoice Draft" },
    });

    await expect(getLocalDraft("missing-key", "user-a")).resolves.toBeNull();
    await expect(getLocalDraft(buildDocumentDraftKey("doc-1", "invoice"), "user-b")).resolves.toBeNull();
  });

  it("deletes drafts by key", async () => {
    const draftKey = buildDocumentDraftKey("doc-delete", "quote");
    await saveLocalDraft({
      draftKey,
      userId: "user-a",
      docType: "quote",
      documentId: "doc-delete",
      payload: { title: "Delete me" },
    });

    await deleteLocalDraft(draftKey);

    await expect(getLocalDraft(draftKey, "user-a")).resolves.toBeNull();
  });

  it("lists drafts for user in updatedAt descending order", async () => {
    await putRawDraftRecord({
      draftKey: "older",
      userId: "user-a",
      docType: "quote",
      documentId: "doc-1",
      payload: { title: "older" },
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
    });
    await putRawDraftRecord({
      draftKey: "newer",
      userId: "user-a",
      docType: "invoice",
      documentId: "doc-2",
      payload: { title: "newer" },
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    });

    await expect(listDraftsForUser("user-a")).resolves.toEqual([
      {
        draftKey: "newer",
        docType: "invoice",
        documentId: "doc-2",
        updatedAt: "2026-04-20T00:00:00.000Z",
      },
      {
        draftKey: "older",
        docType: "quote",
        documentId: "doc-1",
        updatedAt: "2026-04-01T00:00:00.000Z",
      },
    ]);
  });

  it("deletes stale drafts older than the threshold and keeps recent ones", async () => {
    const nowMs = Date.now();
    const staleUpdatedAt = new Date(nowMs - 10 * 24 * 60 * 60 * 1000).toISOString();
    const freshUpdatedAt = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

    await putRawDraftRecord({
      draftKey: "stale-draft",
      userId: "user-a",
      docType: "quote",
      documentId: "doc-1",
      payload: { title: "stale" },
      createdAt: staleUpdatedAt,
      updatedAt: staleUpdatedAt,
    });
    await putRawDraftRecord({
      draftKey: "fresh-draft",
      userId: "user-a",
      docType: "invoice",
      documentId: "doc-2",
      payload: { title: "fresh" },
      createdAt: freshUpdatedAt,
      updatedAt: freshUpdatedAt,
    });

    await deleteStaleLocalDrafts("user-a", 7);

    await expect(getLocalDraft("stale-draft", "user-a")).resolves.toBeNull();
    await expect(getLocalDraft("fresh-draft", "user-a")).resolves.not.toBeNull();
  });

  it("clears all drafts for one user without touching other users", async () => {
    await saveLocalDraft({
      draftKey: "user-a-draft-1",
      userId: "user-a",
      docType: "quote",
      documentId: "doc-a1",
      payload: {},
    });
    await saveLocalDraft({
      draftKey: "user-a-draft-2",
      userId: "user-a",
      docType: "invoice",
      documentId: "doc-a2",
      payload: {},
    });
    await saveLocalDraft({
      draftKey: "user-b-draft",
      userId: "user-b",
      docType: "quote",
      documentId: "doc-b1",
      payload: {},
    });

    await clearDraftsForUser("user-a");

    await expect(getLocalDraft("user-a-draft-1", "user-a")).resolves.toBeNull();
    await expect(getLocalDraft("user-a-draft-2", "user-a")).resolves.toBeNull();
    await expect(getLocalDraft("user-b-draft", "user-b")).resolves.not.toBeNull();
  });

  it("returns null safely for corrupt records", async () => {
    await putRawDraftRecord({
      draftKey: "corrupt",
      userId: "user-a",
      docType: "quote",
      documentId: "doc-1",
      payload: undefined,
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
    } as unknown as LocalDraft);

    await expect(getLocalDraft("corrupt", "user-a")).resolves.toBeNull();
  });
});

async function putRawDraftRecord(record: LocalDraft): Promise<void> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.localDrafts, "readwrite");
  transaction.objectStore(CAPTURE_STORE_NAMES.localDrafts).put(record);
  await transactionDone(transaction);
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}
