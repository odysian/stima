import { CAPTURE_STORE_NAMES, getDb } from "@/features/quotes/offline/captureDb";
import {
  buildLocalId,
  parseStoredSyncEvent,
  requestToPromise,
  transactionDone,
} from "@/features/quotes/offline/captureRepositoryShared";
import type { CreateLocalSyncEventInput, LocalSyncEvent } from "@/features/quotes/offline/captureTypes";

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
