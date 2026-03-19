import { http, HttpResponse } from "msw";

function requireCsrf(request: Request): Response | null {
  if (!request.headers.get("X-CSRF-Token")) {
    return HttpResponse.json({ detail: "CSRF token missing" }, { status: 403 }) as unknown as Response;
  }
  return null;
}

export const handlers = [
  http.post("/api/auth/login", async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    return HttpResponse.json(
      { csrf_token: "test-csrf-token", email: body.email },
      { status: 200 },
    );
  }),

  http.post("/api/auth/register", async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    return HttpResponse.json(
      {
        user: {
          id: "user-1",
          email: body.email,
          is_active: true,
        },
      },
      { status: 201 },
    );
  }),

  http.post("/api/auth/refresh", ({ request }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    return HttpResponse.json(
      { csrf_token: "refreshed-csrf-token" },
      { status: 200 },
    );
  }),

  http.post("/api/auth/logout", ({ request }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    return new HttpResponse(null, { status: 204 });
  }),

  http.get("/api/auth/me", () => {
    return HttpResponse.json(
      { id: "user-1", email: "test@example.com", is_active: true },
      { status: 200 },
    );
  }),
];
