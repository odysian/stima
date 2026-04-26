import { describe, expect, it } from "vitest";

import { buildPendingCaptureError } from "@/features/quotes/components/QuoteList.helpers";
import { LOCAL_STORAGE_RESET_MESSAGE } from "@/features/quotes/offline/captureDb";

describe("buildPendingCaptureError", () => {
  it("suppresses storage-reset errors while auth is transitioning", () => {
    const error = buildPendingCaptureError({
      authMode: "signed_out",
      recoverableCapturesError: LOCAL_STORAGE_RESET_MESSAGE,
      pendingCaptureActionError: null,
    });
    expect(error).toBeNull();
  });

  it("suppresses auth-style errors while auth is transitioning", () => {
    const error = buildPendingCaptureError({
      authMode: "offline_recovered",
      recoverableCapturesError: "CSRF token missing.",
      pendingCaptureActionError: null,
    });
    expect(error).toBeNull();
  });

  it("keeps pending-capture errors visible after auth is verified", () => {
    const error = buildPendingCaptureError({
      authMode: "verified",
      recoverableCapturesError: null,
      pendingCaptureActionError: LOCAL_STORAGE_RESET_MESSAGE,
    });
    expect(error).toBe(LOCAL_STORAGE_RESET_MESSAGE);
  });
});
