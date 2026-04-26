import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearOfflineUserSnapshot,
  readOfflineUserSnapshot,
  writeOfflineUserSnapshot,
} from "@/features/auth/offline/offlineUserSnapshot";

const SNAPSHOT_STORAGE_KEY = "stima.offlineUserSnapshot.v1";
const SNAPSHOT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

describe("offlineUserSnapshot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00.000Z"));
    window.localStorage.clear();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("reads a valid snapshot", () => {
    writeOfflineUserSnapshot({
      userId: "user-1",
      isOnboarded: true,
      timezone: "America/New_York",
      lastVerifiedAt: isoAt(Date.now()),
    });

    expect(readOfflineUserSnapshot()).toEqual({
      userId: "user-1",
      isOnboarded: true,
      timezone: "America/New_York",
      lastVerifiedAt: isoAt(Date.now()),
    });
  });

  it("rejects and clears snapshots older than 14 days", () => {
    writeOfflineUserSnapshot({
      userId: "user-1",
      isOnboarded: true,
      timezone: null,
      lastVerifiedAt: isoAt(Date.now() - SNAPSHOT_MAX_AGE_MS - 1),
    });

    expect(readOfflineUserSnapshot()).toBeNull();
    expect(window.localStorage.getItem(SNAPSHOT_STORAGE_KEY)).toBeNull();
  });

  it("keeps snapshots exactly at the 14-day boundary", () => {
    writeOfflineUserSnapshot({
      userId: "user-1",
      isOnboarded: false,
      timezone: null,
      lastVerifiedAt: isoAt(Date.now() - SNAPSHOT_MAX_AGE_MS),
    });

    expect(readOfflineUserSnapshot()).toEqual({
      userId: "user-1",
      isOnboarded: false,
      timezone: null,
      lastVerifiedAt: isoAt(Date.now() - SNAPSHOT_MAX_AGE_MS),
    });
  });

  it("returns null for malformed json", () => {
    window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, "{not-json");

    expect(readOfflineUserSnapshot()).toBeNull();
  });

  it("returns null when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(readOfflineUserSnapshot()).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it("clearOfflineUserSnapshot removes the stored record", () => {
    writeOfflineUserSnapshot({
      userId: "user-1",
      isOnboarded: true,
      timezone: null,
      lastVerifiedAt: isoAt(Date.now()),
    });

    clearOfflineUserSnapshot();

    expect(window.localStorage.getItem(SNAPSHOT_STORAGE_KEY)).toBeNull();
  });
});
