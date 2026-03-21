import { http, HttpResponse } from "msw";

import type { CustomerCreateRequest } from "@/features/customers/types/customer.types";
import type { ProfileUpdateRequest } from "@/features/profile/types/profile.types";
import type { QuoteCreateRequest } from "@/features/quotes/types/quote.types";

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

  http.post("/api/quotes/convert-notes", async ({ request }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    const body = (await request.json()) as { notes: string };
    return HttpResponse.json(
      {
        transcript: body.notes,
        line_items: [
          {
            description: "Brown mulch",
            details: "5 yards",
            price: 120,
          },
        ],
        total: 120,
        confidence_notes: [],
      },
      { status: 200 },
    );
  }),

  http.post("/api/quotes", async ({ request }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    const body = (await request.json()) as QuoteCreateRequest;
    return HttpResponse.json(
      {
        id: "quote-1",
        customer_id: body.customer_id,
        doc_number: "Q-001",
        status: "draft",
        source_type: body.source_type,
        transcript: body.transcript,
        total_amount: body.total_amount,
        notes: body.notes,
        shared_at: null,
        share_token: null,
        line_items: body.line_items.map((lineItem, index) => ({
          id: `line-${index + 1}`,
          description: lineItem.description,
          details: lineItem.details,
          price: lineItem.price,
          sort_order: index,
        })),
        created_at: "2026-03-20T00:00:00.000Z",
        updated_at: "2026-03-20T00:00:00.000Z",
      },
      { status: 201 },
    );
  }),

  http.post("/api/quotes/capture-audio", ({ request }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    return HttpResponse.json(
      {
        transcript: "Transcribed clip transcript",
        line_items: [
          {
            description: "Brown mulch",
            details: "5 yards",
            price: 120,
          },
        ],
        total: 120,
        confidence_notes: [],
      },
      { status: 200 },
    );
  }),

  http.get("/api/quotes", () => {
    return HttpResponse.json(
      [
        {
          id: "quote-2",
          customer_id: "cust-2",
          customer_name: "Bob Brown",
          doc_number: "Q-002",
          status: "ready",
          total_amount: null,
          created_at: "2026-03-21T00:00:00.000Z",
        },
        {
          id: "quote-1",
          customer_id: "cust-1",
          customer_name: "Alice Johnson",
          doc_number: "Q-001",
          status: "draft",
          total_amount: 120,
          created_at: "2026-03-20T00:00:00.000Z",
        },
      ],
      { status: 200 },
    );
  }),

  http.get("/api/quotes/:id", ({ params }) => {
    const quoteId = String(params.id);

    return HttpResponse.json(
      {
        id: quoteId,
        customer_id: "cust-1",
        doc_number: "Q-001",
        status: "draft",
        source_type: "text",
        transcript: "5 yards brown mulch and edge front beds",
        total_amount: 120,
        notes: "Thanks for your business",
        shared_at: null,
        share_token: null,
        line_items: [
          {
            id: "line-1",
            description: "Brown mulch",
            details: "5 yards",
            price: 120,
            sort_order: 0,
          },
        ],
        created_at: "2026-03-20T00:00:00.000Z",
        updated_at: "2026-03-20T00:00:00.000Z",
      },
      { status: 200 },
    );
  }),

  http.post("/api/quotes/:id/pdf", ({ request }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    return new HttpResponse("mock-pdf-bytes", {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
      },
    });
  }),

  http.post("/api/quotes/:id/share", ({ request, params }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    const quoteId = String(params.id);
    return HttpResponse.json(
      {
        id: quoteId,
        customer_id: "cust-1",
        doc_number: "Q-001",
        status: "shared",
        source_type: "text",
        transcript: "5 yards brown mulch and edge front beds",
        total_amount: 120,
        notes: "Thanks for your business",
        shared_at: "2026-03-20T00:05:00.000Z",
        share_token: "share-token-1",
        line_items: [
          {
            id: "line-1",
            description: "Brown mulch",
            details: "5 yards",
            price: 120,
            sort_order: 0,
          },
        ],
        created_at: "2026-03-20T00:00:00.000Z",
        updated_at: "2026-03-20T00:05:00.000Z",
      },
      { status: 200 },
    );
  }),
];
