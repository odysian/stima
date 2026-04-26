import { describe, expect, it } from "vitest";

import {
  LOCAL_STORAGE_RESET_MESSAGE,
  LocalStorageUnavailableError,
  getStorageErrorMessage,
  isStorageResetError,
} from "@/features/quotes/offline/captureDb";

describe("captureDb storage error helpers", () => {
  it("detects local storage unavailability errors", () => {
    expect(isStorageResetError(new LocalStorageUnavailableError("IndexedDB unavailable."))).toBe(true);
  });

  it("detects IndexedDB connection-closing style errors", () => {
    const domError = new DOMException("The database connection is closing.", "InvalidStateError");
    expect(isStorageResetError(domError)).toBe(true);
    expect(isStorageResetError(new Error("Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing."))).toBe(true);
  });

  it("returns a sanitized user-safe message for storage reset failures", () => {
    const message = getStorageErrorMessage(
      new Error("Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing."),
      "Unable to load pending captures.",
    );
    expect(message).toBe(LOCAL_STORAGE_RESET_MESSAGE);
  });
});
