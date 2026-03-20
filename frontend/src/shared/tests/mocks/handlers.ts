import { http, HttpResponse } from "msw";

import type { CustomerCreateRequest } from "@/features/customers/types/customer.types";
import type { ProfileUpdateRequest } from "@/features/profile/types/profile.types";

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
          is_onboarded: false,
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
      { id: "user-1", email: "test@example.com", is_active: true, is_onboarded: true },
      { status: 200 },
    );
  }),

  http.get("/api/profile", () => {
    return HttpResponse.json(
      {
        id: "user-1",
        email: "test@example.com",
        is_active: true,
        is_onboarded: true,
        business_name: "Summit Exterior Care",
        first_name: "Alex",
        last_name: "Stone",
        trade_type: "Landscaping",
      },
      { status: 200 },
    );
  }),

  http.patch("/api/profile", async ({ request }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    const body = (await request.json()) as ProfileUpdateRequest;
    return HttpResponse.json(
      {
        id: "user-1",
        email: "test@example.com",
        is_active: true,
        is_onboarded: true,
        ...body,
      },
      { status: 200 },
    );
  }),

  http.get("/api/customers", () => {
    return HttpResponse.json(
      [
        {
          id: "cust-1",
          name: "Alice Johnson",
          phone: "555-0101",
          email: "alice@example.com",
          address: null,
          created_at: "2026-03-20T00:00:00.000Z",
          updated_at: "2026-03-20T00:00:00.000Z",
        },
        {
          id: "cust-2",
          name: "Bob Brown",
          phone: null,
          email: "bob@example.com",
          address: null,
          created_at: "2026-03-20T00:00:00.000Z",
          updated_at: "2026-03-20T00:00:00.000Z",
        },
      ],
      { status: 200 },
    );
  }),

  http.post("/api/customers", async ({ request }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    const body = (await request.json()) as CustomerCreateRequest;
    return HttpResponse.json(
      {
        id: "cust-new",
        name: body.name,
        phone: body.phone ?? null,
        email: body.email ?? null,
        address: body.address ?? null,
        created_at: "2026-03-20T00:00:00.000Z",
        updated_at: "2026-03-20T00:00:00.000Z",
      },
      { status: 201 },
    );
  }),
];
