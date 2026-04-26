export const CAPTURE_DB_NAME = "stima-local";
export const CAPTURE_DB_VERSION = 1;

export const CAPTURE_STORE_NAMES = {
  captureSessions: "capture_sessions",
  syncEvents: "sync_events",
  audioClips: "audio_clips",
  localDrafts: "local_drafts",
  outboxJobs: "outbox_jobs",
} as const;

type CaptureStoreName = (typeof CAPTURE_STORE_NAMES)[keyof typeof CAPTURE_STORE_NAMES];

type StoreDefinition = {
  name: CaptureStoreName;
  keyPath: string;
  indexes: Array<{
    name: string;
    keyPath: string | string[];
    options?: IDBIndexParameters;
  }>;
};

const STORE_DEFINITIONS: StoreDefinition[] = [
  {
    name: CAPTURE_STORE_NAMES.captureSessions,
    keyPath: "sessionId",
    indexes: [
      { name: "userId", keyPath: "userId" },
      { name: "status", keyPath: "status" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: CAPTURE_STORE_NAMES.syncEvents,
    keyPath: "eventId",
    indexes: [
      { name: "sessionId", keyPath: "sessionId" },
      { name: "userId", keyPath: "userId" },
    ],
  },
  {
    name: CAPTURE_STORE_NAMES.audioClips,
    keyPath: "clipId",
    indexes: [
      { name: "sessionId", keyPath: "sessionId" },
      { name: "userId", keyPath: "userId" },
    ],
  },
  {
    name: CAPTURE_STORE_NAMES.localDrafts,
    keyPath: "draftKey",
    indexes: [
      { name: "userId", keyPath: "userId" },
      { name: "documentId", keyPath: "documentId" },
    ],
  },
  {
    name: CAPTURE_STORE_NAMES.outboxJobs,
    keyPath: "jobId",
    indexes: [
      { name: "userId", keyPath: "userId" },
      { name: "status", keyPath: "status" },
      { name: "sessionId", keyPath: "sessionId" },
    ],
  },
];

export class LocalStorageUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LocalStorageUnavailableError";
  }
}

export const LOCAL_STORAGE_RESET_MESSAGE =
  "Local device storage was reset or became unavailable. Sign in again to continue.";

let dbPromise: Promise<IDBDatabase> | null = null;

export async function getDb(): Promise<IDBDatabase> {
  return getDbWithRetry(false);
}

async function getDbWithRetry(retried: boolean): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDb().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }

  const db = await dbPromise;
  if (isDbConnectionUsable(db)) {
    return db;
  }

  try {
    db.close();
  } catch {
    // Ignore close errors while resetting stale handles.
  }
  dbPromise = null;

  if (!retried) {
    return getDbWithRetry(true);
  }

  throw new LocalStorageUnavailableError("IndexedDB connection is unavailable.");
}

async function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    throw new LocalStorageUnavailableError("IndexedDB is unavailable in this environment.");
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CAPTURE_DB_NAME, CAPTURE_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const transaction = request.transaction;
      if (!transaction) {
        throw new LocalStorageUnavailableError("IndexedDB upgrade transaction is missing.");
      }

      const oldVersion = typeof event.oldVersion === "number" ? event.oldVersion : 0;
      applyMigrations(request.result, transaction, oldVersion);
    };

    request.onerror = () => {
      reject(
        new LocalStorageUnavailableError("Failed to open IndexedDB.", {
          cause: request.error,
        }),
      );
    };

    request.onblocked = () => {
      reject(new LocalStorageUnavailableError("IndexedDB open was blocked by another connection."));
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        dbPromise = null;
        db.close();
      };
      resolve(db);
    };
  });
}

function applyMigrations(db: IDBDatabase, transaction: IDBTransaction, oldVersion: number): void {
  const normalizedOldVersion = Number.isFinite(oldVersion) ? oldVersion : 0;
  const startVersion = Math.max(normalizedOldVersion + 1, 1);
  for (let version = startVersion; version <= CAPTURE_DB_VERSION; version += 1) {
    if (version === 1) {
      createVersionOneSchema(db, transaction);
    }
  }
}

function createVersionOneSchema(db: IDBDatabase, transaction: IDBTransaction): void {
  for (const definition of STORE_DEFINITIONS) {
    ensureStore(db, transaction, definition);
  }
}

function ensureStore(
  db: IDBDatabase,
  transaction: IDBTransaction,
  definition: StoreDefinition,
): void {
  let store: IDBObjectStore;
  if (db.objectStoreNames.contains(definition.name)) {
    store = transaction.objectStore(definition.name);
  } else {
    store = db.createObjectStore(definition.name, { keyPath: definition.keyPath });
  }

  for (const index of definition.indexes) {
    if (!store.indexNames.contains(index.name)) {
      store.createIndex(index.name, index.keyPath, index.options);
    }
  }
}

export async function resetCaptureDbForTests(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      // Ignore stale open errors while resetting in tests.
    } finally {
      dbPromise = null;
    }
  }

  if (typeof indexedDB === "undefined") {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(CAPTURE_DB_NAME);
    request.onerror = () => reject(request.error ?? new Error("Failed to reset IndexedDB."));
    request.onblocked = () => resolve();
    request.onsuccess = () => resolve();
  });
}

function isDbConnectionUsable(db: IDBDatabase): boolean {
  if (db.objectStoreNames.length === 0) {
    return true;
  }

  try {
    const firstStoreName = db.objectStoreNames.item(0);
    if (!firstStoreName) {
      return true;
    }
    const transaction = db.transaction(firstStoreName, "readonly");
    transaction.abort();
    return true;
  } catch {
    return false;
  }
}

export function isStorageResetError(error: unknown): boolean {
  if (error instanceof LocalStorageUnavailableError) {
    return true;
  }
  if (error instanceof DOMException && (error.name === "InvalidStateError" || error.name === "AbortError")) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("database connection is closing") ||
    message.includes("connection is closing") ||
    message.includes("invalidstateerror") ||
    message.includes("indexeddb is unavailable") ||
    message.includes("idbdatabase")
  );
}

export function getStorageErrorMessage(error: unknown, fallback: string): string {
  if (isStorageResetError(error)) {
    return LOCAL_STORAGE_RESET_MESSAGE;
  }
  return error instanceof Error ? error.message : fallback;
}
