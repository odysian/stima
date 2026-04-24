import { afterEach, describe, expect, it } from "vitest";

import { classifySubmitFailure } from "@/features/quotes/offline/classifySubmitFailure";
import { HttpRequestError } from "@/shared/lib/http";

const ORIGINAL_NAVIGATOR_ONLINE_DESCRIPTOR = Object.getOwnPropertyDescriptor(window.navigator, "onLine");

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

function restoreNavigatorOnline(): void {
  if (ORIGINAL_NAVIGATOR_ONLINE_DESCRIPTOR) {
    Object.defineProperty(window.navigator, "onLine", ORIGINAL_NAVIGATOR_ONLINE_DESCRIPTOR);
    return;
  }
  delete (window.navigator as { onLine?: boolean }).onLine;
}

afterEach(() => {
  restoreNavigatorOnline();
});

describe("classifySubmitFailure", () => {
  it("returns offline when browser is offline", () => {
    setNavigatorOnline(false);

    expect(classifySubmitFailure(new Error("Network error"))).toBe("offline");
  });

  it("classifies timeout-like errors", () => {
    setNavigatorOnline(true);

    expect(classifySubmitFailure(new Error("request timed out"))).toBe("timeout");
  });

  it("classifies auth and validation http errors", () => {
    setNavigatorOnline(true);

    expect(classifySubmitFailure(new HttpRequestError("Unauthorized", 401, null))).toBe("auth_required");
    expect(classifySubmitFailure(new HttpRequestError("Invalid payload", 422, null))).toBe("validation_failed");
  });

  it("treats 409 with in-progress detail as retryable", () => {
    setNavigatorOnline(true);

    expect(
      classifySubmitFailure(
        new HttpRequestError("Conflict", 409, { detail: "extraction already in progress" }),
      ),
    ).toBe("server_retryable");
  });

  it("defaults unknown errors to retryable", () => {
    setNavigatorOnline(true);

    expect(classifySubmitFailure({ message: "wat" })).toBe("server_retryable");
  });
});
