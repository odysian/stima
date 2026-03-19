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
        }),
      );

    const user = await request<User>("/api/auth/me");

    expect(user).toEqual({
      id: "user-9",
      email: "user@example.com",
      is_active: true,
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/auth/refresh");

    const refreshInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(refreshInit.headers).get("X-CSRF-Token")).toBe("boot-token");
  });
});
