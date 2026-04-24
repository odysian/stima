import { CAPTURE_STORE_NAMES, getDb } from "@/features/quotes/offline/captureDb";

export type DraftDocType = "quote" | "invoice" | "capture_handoff";

export const CAPTURE_HANDOFF_DOCUMENT_ID = "capture_handoff";

export interface LocalDraft<TPayload = unknown> {
  draftKey: string;
  userId: string;
  docType: DraftDocType;
  documentId: string;
  payload: TPayload;
  createdAt: string;
  updatedAt: string;
}

export interface SaveLocalDraftInput<TPayload = unknown> {
  draftKey: string;
  userId: string;
  docType: DraftDocType;
  documentId: string;
  payload: TPayload;
}

export type LocalDraftSummary = Pick<
  LocalDraft,
  "draftKey" | "docType" | "documentId" | "updatedAt"
>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function buildCaptureHandoffDraftKey(userId: string): string {
  return `capture_handoff:${userId}`;
}

export function buildDocumentDraftKey(documentId: string, docType: "quote" | "invoice"): string {
  return `${documentId}:${docType}`;
}

export async function saveLocalDraft<TPayload>(input: SaveLocalDraftInput<TPayload>): Promise<void> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.localDrafts, "readwrite");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.localDrafts);
  const existingRawRecord = await requestToPromise(store.get(input.draftKey));
  const existingDraft = parseStoredDraftRecord(existingRawRecord);
  const now = new Date().toISOString();
  const nextRecord: LocalDraft<TPayload> = {
    draftKey: input.draftKey,
    userId: input.userId,
    docType: input.docType,
    documentId: input.documentId,
    payload: input.payload,
    createdAt: existingDraft?.createdAt ?? now,
    updatedAt: now,
  };
  store.put(nextRecord);
  await transactionDone(transaction);
}

export async function getLocalDraft<TPayload = unknown>(
  draftKey: string,
  userId: string,
): Promise<LocalDraft<TPayload> | null> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.localDrafts, "readonly");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.localDrafts);
  const rawRecord = await requestToPromise(store.get(draftKey));
  await transactionDone(transaction);

  const record = parseStoredDraftRecord(rawRecord);
  if (!record || record.userId !== userId) {
    return null;
  }

  return record as LocalDraft<TPayload>;
}

export async function deleteLocalDraft(draftKey: string): Promise<void> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.localDrafts, "readwrite");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.localDrafts);
  store.delete(draftKey);
  await transactionDone(transaction);
}

export async function listDraftsForUser(userId: string): Promise<LocalDraftSummary[]> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.localDrafts, "readonly");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.localDrafts);
  const userIndex = store.index("userId");
  const rawRecords = await requestToPromise(userIndex.getAll(IDBKeyRange.only(userId)));
  await transactionDone(transaction);

  return rawRecords
    .map(parseStoredDraftRecord)
    .filter((record): record is LocalDraft => record !== null && record.userId === userId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((record) => ({
      draftKey: record.draftKey,
      docType: record.docType,
      documentId: record.documentId,
      updatedAt: record.updatedAt,
    }));
}

export async function deleteStaleLocalDrafts(userId: string, olderThanDays = 7): Promise<void> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.localDrafts, "readwrite");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.localDrafts);
  const userIndex = store.index("userId");
  const rawRecords = await requestToPromise(userIndex.getAll(IDBKeyRange.only(userId)));
  const staleThresholdMs = Date.now() - Math.max(olderThanDays, 0) * MS_PER_DAY;

  for (const rawRecord of rawRecords) {
    const record = parseStoredDraftRecord(rawRecord);
    if (!record) {
      continue;
    }

    const updatedAtMs = Date.parse(record.updatedAt);
    const isStale = Number.isNaN(updatedAtMs) || updatedAtMs < staleThresholdMs;
    if (isStale) {
      store.delete(record.draftKey);
    }
  }

  await transactionDone(transaction);
}

export async function clearDraftsForUser(userId: string): Promise<void> {
  const db = await getDb();
  const transaction = db.transaction(CAPTURE_STORE_NAMES.localDrafts, "readwrite");
  const store = transaction.objectStore(CAPTURE_STORE_NAMES.localDrafts);
  const userIndex = store.index("userId");
  const draftKeys = await requestToPromise(userIndex.getAllKeys(IDBKeyRange.only(userId)));

  for (const draftKey of draftKeys) {
    store.delete(draftKey);
  }

  await transactionDone(transaction);
}

function parseStoredDraftRecord(value: unknown): LocalDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  const draftKey = value.draftKey;
  const userId = value.userId;
  const docType = value.docType;
  const documentId = value.documentId;
  const createdAt = value.createdAt;
  const updatedAt = value.updatedAt;
  const payload = value.payload;

  if (
    typeof draftKey !== "string" ||
    typeof userId !== "string" ||
    (docType !== "quote" && docType !== "invoice" && docType !== "capture_handoff") ||
    typeof documentId !== "string" ||
    typeof createdAt !== "string" ||
    typeof updatedAt !== "string" ||
    payload === undefined
  ) {
    return null;
  }

  return {
    draftKey,
    userId,
    docType,
    documentId,
    payload,
    createdAt,
    updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
