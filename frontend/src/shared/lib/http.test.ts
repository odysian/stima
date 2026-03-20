import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/features/auth/types/auth.types";
import { clearCsrfToken, request } from "@/shared/lib/http";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function clearCsrfCookie(): void {
  document.cookie = "stima_csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
}

describe("http request helper", () => {
  beforeEach(() => {
    clearCsrfToken();
    clearCsrfCookie();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    clearCsrfToken();
    clearCsrfCookie();
    vi.unstubAllGlobals();
  });

  it("hydrates CSRF token from cookie for mutating requests", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    document.cookie = "stima_csrf_token=cookie-token; path=/";

    await request<{ ok: boolean }>("/api/quotes", {
      method: "POST",
      body: { name: "demo" },
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(requestInit.headers).get("X-CSRF-Token")).toBe("cookie-token");
  });

  it("uses CSRF cookie during refresh after a 401 on page-reload scenario", async () => {
    const fetchMock = vi.mocked(fetch);

    document.cookie = "stima_csrf_token=boot-token; path=/";

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "rotated-token" }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: "user-9",
          email: "user@example.com",
          is_active: true,
          is_onboarded: true,
        }),
      );

    const user = await request<User>("/api/auth/me");

    expect(user).toEqual({
      id: "user-9",
      email: "user@example.com",
      is_active: true,
      is_onboarded: true,
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/auth/refresh");

    const refreshInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(refreshInit.headers).get("X-CSRF-Token")).toBe("boot-token");
  });

  it("clears CSRF and throws when refresh itself fails with 401", async () => {
    const fetchMock = vi.mocked(fetch);

    document.cookie = "stima_csrf_token=boot-token; path=/";

    // original → 401, refresh → 401
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401));

    await expect(request("/api/auth/me")).rejects.toThrow("Unauthorized");

    // CSRF should be cleared — clear cookie too so hydrate doesn't re-read it
    clearCsrfCookie();
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await request("/api/quotes", { method: "POST", body: { a: 1 }, skipRefresh: true });

    const postInit = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(new Headers(postInit.headers).get("X-CSRF-Token")).toBeNull();
  });

  it("deduplicates concurrent 401 refreshes into a single flight", async () => {
    const fetchMock = vi.mocked(fetch);

    document.cookie = "stima_csrf_token=boot-token; path=/";

    // Two original requests both get 401, then one refresh succeeds,
    // then both replays succeed.
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401)) // req A original
      .mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401)) // req B original
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "new-token" }))     // single refresh
      .mockResolvedValueOnce(jsonResponse({ id: "a" }))                     // req A replay
      .mockResolvedValueOnce(jsonResponse({ id: "b" }));                    // req B replay

    const [resultA, resultB] = await Promise.all([
      request<{ id: string }>("/api/auth/me"),
      request<{ id: string }>("/api/auth/me"),
    ]);

    expect(resultA).toEqual({ id: "a" });
    expect(resultB).toEqual({ id: "b" });

    // Exactly one call to /api/auth/refresh
    const refreshCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === "/api/auth/refresh",
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it("uses the rotated CSRF token from refresh on the replayed request", async () => {
    const fetchMock = vi.mocked(fetch);

    document.cookie = "stima_csrf_token=boot-token; path=/";

    // original → 401, refresh returns rotated token, replay
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "rotated-token" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await request("/api/quotes", { method: "POST", body: { x: 1 } });

    // The replayed request (call index 2) must carry the rotated token
    const replayInit = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(new Headers(replayInit.headers).get("X-CSRF-Token")).toBe("rotated-token");
  });
});
