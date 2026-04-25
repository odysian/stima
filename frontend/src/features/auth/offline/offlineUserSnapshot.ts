export interface OfflineUserSnapshot {
  userId: string;
  isOnboarded: boolean;
  timezone: string | null;
  lastVerifiedAt: string;
}

const SNAPSHOT_STORAGE_KEY = "stima.offlineUserSnapshot.v1";
const SNAPSHOT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSnapshot(value: unknown): OfflineUserSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const userId = value.userId;
  const isOnboarded = value.isOnboarded;
  const timezone = value.timezone;
  const lastVerifiedAt = value.lastVerifiedAt;

  if (
    typeof userId !== "string"
    || userId.length === 0
    || typeof isOnboarded !== "boolean"
    || (timezone !== null && typeof timezone !== "string")
    || typeof lastVerifiedAt !== "string"
  ) {
    return null;
  }

  return {
    userId,
    isOnboarded,
    timezone,
    lastVerifiedAt,
  };
}

function isExpired(lastVerifiedAt: string): boolean {
  const verifiedAtMs = Date.parse(lastVerifiedAt);
  if (Number.isNaN(verifiedAtMs)) {
    return true;
  }
  return Date.now() - verifiedAtMs > SNAPSHOT_MAX_AGE_MS;
}

export function writeOfflineUserSnapshot(snapshot: OfflineUserSnapshot): void {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn("Unable to persist offline user snapshot.", error);
  }
}

export function readOfflineUserSnapshot(): OfflineUserSnapshot | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const snapshot = parseSnapshot(JSON.parse(rawValue) as unknown);
    if (!snapshot || isExpired(snapshot.lastVerifiedAt)) {
      window.localStorage.removeItem(SNAPSHOT_STORAGE_KEY);
      return null;
    }

    return snapshot;
  } catch (error) {
    console.warn("Unable to read offline user snapshot.", error);
    return null;
  }
}

export function clearOfflineUserSnapshot(): void {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(SNAPSHOT_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to clear offline user snapshot.", error);
  }
}
