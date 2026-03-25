import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { authService } from "@/features/auth/services/authService";
import { clearCsrfToken, request } from "@/shared/lib/http";
import { server } from "@/shared/tests/mocks/server";

describe("authService integration (MSW)", () => {
  afterEach(() => {
    clearCsrfToken();
  });

  it("login sets CSRF token that propagates to subsequent mutating requests", async () => {
    await authService.login({ email: "a@b.com", password: "pass" });

    // Logout is a mutating POST — MSW handler requires X-CSRF-Token.
    // If the token from login didn't propagate, MSW returns 403 and
    // request() would throw.
    await authService.logout();
  });

  it("register sends correct payload and returns user", async () => {
    // Override register to capture and echo the request body for assertion
    let capturedBody: { email: string; password: string } | null = null;

    server.use(
      http.post("/api/auth/register", async ({ request: req }) => {
        capturedBody = (await req.json()) as { email: string; password: string };
        return HttpResponse.json(
          {
            user: {
              id: "user-42",
              email: capturedBody.email,
              is_active: true,
              is_onboarded: false,
              timezone: null,
            },
          },
          { status: 201 },
        );
      }),
    );

    await authService.register({ email: "new@example.com", password: "s3cret" });

    expect(capturedBody).toEqual({ email: "new@example.com", password: "s3cret" });
  });

  it("logout clears CSRF so next mutating request has no token", async () => {
    await authService.login({ email: "a@b.com", password: "pass" });
    await authService.logout();

    // After logout, CSRF should be cleared.
    // Set up a handler that captures headers on a mutating endpoint.
    let csrfHeader: string | null = "NOT_CHECKED";

    server.use(
      http.post("/api/test/mutating", ({ request: req }) => {
        csrfHeader = req.headers.get("X-CSRF-Token");
        return HttpResponse.json({ ok: true });
      }),
    );

    await request("/api/test/mutating", {
      method: "POST",
      body: { x: 1 },
      skipRefresh: true,
    });

    expect(csrfHeader).toBeNull();
  });

  it("auto-refreshes on 401 and retries successfully (end-to-end)", async () => {
    // Login first to establish CSRF token (needed for refresh's CSRF validation)
    await authService.login({ email: "a@b.com", password: "pass" });

    let meCallCount = 0;

    server.use(
      http.get("/api/auth/me", () => {
        meCallCount++;
        if (meCallCount === 1) {
          return HttpResponse.json({ detail: "Unauthorized" }, { status: 401 });
        }
        return HttpResponse.json(
          {
            id: "user-1",
            email: "test@example.com",
            is_active: true,
            is_onboarded: true,
            timezone: "America/New_York",
          },
          { status: 200 },
        );
      }),
    );

    const user = await authService.me();

    expect(user).toEqual({
      id: "user-1",
      email: "test@example.com",
      is_active: true,
      is_onboarded: true,
      timezone: "America/New_York",
    });
    expect(meCallCount).toBe(2);
  });

  it("preserves error message from failed login", async () => {
    server.use(
      http.post("/api/auth/login", () => {
        return HttpResponse.json(
          { detail: "Invalid credentials" },
          { status: 401 },
        );
      }),
    );

    await expect(
      authService.login({ email: "bad@example.com", password: "wrong" }),
    ).rejects.toThrow("Invalid credentials");
  });

  it("clears CSRF and propagates error when refresh also fails", async () => {
    // Login to get a CSRF token
    await authService.login({ email: "a@b.com", password: "pass" });

    server.use(
      http.get("/api/auth/me", () => {
        return HttpResponse.json({ detail: "Unauthorized" }, { status: 401 });
      }),
      http.post("/api/auth/refresh", () => {
        return HttpResponse.json({ detail: "Unauthorized" }, { status: 401 });
      }),
    );

    await expect(authService.me()).rejects.toThrow("Unauthorized");

    // CSRF should be cleared — verify via a captured header
    let csrfHeader: string | null = "NOT_CHECKED";

    server.use(
      http.post("/api/test/probe", ({ request: req }) => {
        csrfHeader = req.headers.get("X-CSRF-Token");
        return HttpResponse.json({ ok: true });
      }),
    );

    await request("/api/test/probe", {
      method: "POST",
      body: { x: 1 },
      skipRefresh: true,
    });

    expect(csrfHeader).toBeNull();
  });
});
