import { http, HttpResponse } from "msw";

import type { CustomerCreateRequest } from "@/features/customers/types/customer.types";
import type {
  InvoiceCreateRequest,
  InvoiceUpdateRequest,
} from "@/features/invoices/types/invoice.types";
import type { ProfileUpdateRequest } from "@/features/profile/types/profile.types";
import type { QuoteCreateRequest } from "@/features/quotes/types/quote.types";

function requireCsrf(request: Request): Response | null {
  if (!request.headers.get("X-CSRF-Token")) {
    return HttpResponse.json(
      { detail: "CSRF token missing" },
      { status: 403 },
    ) as unknown as Response;
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
          timezone: null,
        },
      },
      { status: 201 },
    );
  }),

  http.post("/api/auth/forgot-password", () => {
    return HttpResponse.json(
      { detail: "If an account exists for that email, a reset link has been sent." },
      { status: 200 },
    );
  }),

  http.post("/api/auth/reset-password", () => {
    return HttpResponse.json(
      { detail: "Password has been reset." },
      { status: 200 },
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
      {
        id: "user-1",
        email: "test@example.com",
        is_active: true,
        is_onboarded: true,
        timezone: null,
      },
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
        phone_number: null,
        business_address_line1: null,
        business_address_line2: null,
        business_city: null,
        business_state: null,
        business_postal_code: null,
        formatted_address: null,
        trade_type: "Landscaper",
        timezone: null,
        default_tax_rate: null,
        has_logo: false,
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
        has_logo: false,
        formatted_address: body.business_address_line1 ?? null,
        ...body,
      },
      { status: 200 },
    );
  }),

  http.post("/api/profile/logo", async ({ request }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    return HttpResponse.json(
      {
        id: "user-1",
        email: "test@example.com",
        is_active: true,
        is_onboarded: true,
        business_name: "Summit Exterior Care",
        first_name: "Alex",
        last_name: "Stone",
        phone_number: null,
        business_address_line1: null,
        business_address_line2: null,
        business_city: null,
        business_state: null,
        business_postal_code: null,
        formatted_address: null,
        trade_type: "Landscaper",
        timezone: null,
        default_tax_rate: null,
        has_logo: true,
      },
      { status: 200 },
    );
  }),

  http.delete("/api/profile/logo", ({ request }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    return new HttpResponse(null, { status: 204 });
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
          address_line1: null,
          address_line2: null,
          city: null,
          state: null,
          postal_code: null,
          formatted_address: null,
          created_at: "2026-03-20T00:00:00.000Z",
          updated_at: "2026-03-20T00:00:00.000Z",
        },
        {
          id: "cust-2",
          name: "Bob Brown",
          phone: null,
          email: "bob@example.com",
          address: null,
          address_line1: null,
          address_line2: null,
          city: null,
          state: null,
          postal_code: null,
          formatted_address: null,
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
        address_line1: body.address_line1 ?? null,
        address_line2: body.address_line2 ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        postal_code: body.postal_code ?? null,
        formatted_address: body.address_line1 ?? null,
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
        title: body.title,
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

  http.post("/api/quotes/manual-draft", async ({ request }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    const body = (await request.json()) as { customer_id?: string };
    return HttpResponse.json(
      {
        id: "quote-manual-1",
        customer_id: body.customer_id ?? null,
        doc_number: "Q-003",
        title: null,
        status: "draft",
        source_type: "text",
        transcript: "",
        total_amount: null,
        tax_rate: null,
        discount_type: null,
        discount_value: null,
        deposit_amount: null,
        notes: null,
        shared_at: null,
        share_token: null,
        line_items: [],
        created_at: "2026-03-20T00:00:00.000Z",
        updated_at: "2026-03-20T00:00:00.000Z",
      },
      { status: 201 },
    );
  }),

  http.post("/api/quotes/extract", async ({ request }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    return HttpResponse.json(
      {
        quote_id: "quote-1",
        transcript: "Transcribed clip transcript",
        line_items: [
          {
            description: "Brown mulch",
            details: "5 yards",
            price: 120,
          },
        ],
        total: 120,
      },
      { status: 200 },
    );
  }),

  http.get("/api/jobs/:jobId", ({ params }) => {
    return HttpResponse.json(
      {
        id: String(params.jobId),
        user_id: "user-1",
        document_id: "quote-1",
        job_type: "extraction",
        status: "success",
        attempts: 1,
        terminal_error: null,
        extraction_result: {
          transcript: "Transcribed clip transcript",
          line_items: [
            {
              description: "Brown mulch",
              details: "5 yards",
              price: 120,
            },
          ],
          total: 120,
        },
        quote_id: "quote-1",
        created_at: "2026-03-20T00:00:00.000Z",
        updated_at: "2026-03-20T00:00:00.000Z",
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
          title: null,
          status: "ready",
          total_amount: null,
          item_count: 1,
          created_at: "2026-03-21T00:00:00.000Z",
        },
        {
          id: "quote-1",
          customer_id: "cust-1",
          customer_name: "Alice Johnson",
          doc_number: "Q-001",
          title: null,
          status: "draft",
          total_amount: 120,
          item_count: 1,
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
        customer_name: "Alice Johnson",
        customer_email: "alice@example.com",
        customer_phone: "+1-555-0100",
        doc_number: "Q-001",
        title: null,
        status: "draft",
        source_type: "text",
        transcript: "5 yards brown mulch and edge front beds",
        total_amount: 120,
        notes: "Thanks for your business",
        shared_at: null,
        share_token: null,
        has_active_share: false,
        linked_invoice: null,
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
        title: null,
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

  http.post("/api/quotes/:id/send-email", ({ request, params }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    const quoteId = String(params.id);
    return HttpResponse.json(
      {
        id: `job-email-quote-${quoteId}`,
        user_id: "user-1",
        document_id: quoteId,
        job_type: "email",
        status: "pending",
        attempts: 0,
        terminal_error: null,
        extraction_result: null,
        quote_id: null,
        created_at: "2026-03-20T00:00:00.000Z",
        updated_at: "2026-03-20T00:00:00.000Z",
      },
      { status: 202 },
    );
  }),

  http.post("/api/quotes/:id/convert-to-invoice", ({ request }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    return HttpResponse.json(
      {
        id: "invoice-1",
        customer_id: "cust-1",
        doc_number: "I-001",
        title: "Spring cleanup",
        status: "draft",
        total_amount: 120,
        notes: "Thanks for your business",
        due_date: "2026-04-19",
        shared_at: null,
        share_token: null,
        has_active_share: false,
        source_document_id: "quote-1",
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
      { status: 201 },
    );
  }),

  http.post("/api/invoices", async ({ request }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    const body = (await request.json()) as InvoiceCreateRequest;
    return HttpResponse.json(
      {
        id: "invoice-1",
        customer_id: body.customer_id,
        doc_number: "I-001",
        title: body.title,
        status: "draft",
        total_amount: body.total_amount,
        notes: body.notes,
        due_date: "2026-04-19",
        shared_at: null,
        share_token: null,
        source_document_id: null,
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

  http.get("/api/invoices", ({ request }) => {
    const customerId = new URL(request.url).searchParams.get("customer_id");
    const invoices = [
      {
        id: "invoice-2",
        customer_id: "cust-2",
        customer_name: "Bob Brown",
        doc_number: "I-002",
        title: "Front bed refresh",
        status: "ready",
        total_amount: 220,
        due_date: "2026-04-22",
        created_at: "2026-03-21T00:00:00.000Z",
        source_document_id: null,
      },
      {
        id: "invoice-1",
        customer_id: "cust-1",
        customer_name: "Alice Johnson",
        doc_number: "I-001",
        title: "Spring cleanup",
        status: "draft",
        total_amount: 120,
        due_date: "2026-04-19",
        created_at: "2026-03-20T00:00:00.000Z",
        source_document_id: "quote-1",
      },
    ];

    const filteredInvoices = customerId
      ? invoices.filter((invoice) => invoice.customer_id === customerId)
      : invoices;

    return HttpResponse.json(filteredInvoices, { status: 200 });
  }),

  http.get("/api/invoices/:id", ({ params }) => {
    const invoiceId = String(params.id);

    return HttpResponse.json(
      {
        id: invoiceId,
        customer_id: "cust-1",
        doc_number: "I-001",
        title: "Spring cleanup",
        status: "draft",
        total_amount: 120,
        notes: "Thanks for your business",
        due_date: "2026-04-19",
        shared_at: null,
        share_token: null,
        source_document_id: "quote-1",
        source_quote_number: "Q-001",
        customer: {
          id: "cust-1",
          name: "Alice Johnson",
          email: "alice@example.com",
          phone: "+1-555-0100",
        },
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

  http.patch("/api/invoices/:id", async ({ request, params }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    const invoiceId = String(params.id);
    const body = (await request.json()) as InvoiceUpdateRequest;
    const hasField = <K extends keyof InvoiceUpdateRequest>(
      field: K,
    ): boolean => Object.prototype.hasOwnProperty.call(body, field);
    const lineItems = hasField("line_items")
      ? (body.line_items ?? []).map((lineItem, index) => ({
          id: `line-${index + 1}`,
          description: lineItem.description,
          details: lineItem.details,
          price: lineItem.price,
          sort_order: index,
        }))
      : [
          {
            id: "line-1",
            description: "Brown mulch",
            details: "5 yards",
            price: 120,
            sort_order: 0,
          },
        ];
    return HttpResponse.json(
      {
        id: invoiceId,
        customer_id: "cust-1",
        doc_number: "I-001",
        title: hasField("title") ? (body.title ?? null) : "Spring cleanup",
        status: "draft",
        total_amount: hasField("total_amount")
          ? (body.total_amount ?? null)
          : 120,
        notes: hasField("notes")
          ? (body.notes ?? null)
          : "Thanks for your business",
        due_date: hasField("due_date") ? (body.due_date ?? null) : "2026-04-19",
        shared_at: null,
        share_token: null,
        source_document_id: "quote-1",
        line_items: lineItems,
        created_at: "2026-03-20T00:00:00.000Z",
        updated_at: "2026-03-20T00:10:00.000Z",
      },
      { status: 200 },
    );
  }),

  http.post("/api/invoices/:id/pdf", ({ request }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    return new HttpResponse("mock-invoice-pdf-bytes", {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
      },
    });
  }),

  http.post("/api/invoices/:id/share", ({ request, params }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    const invoiceId = String(params.id);
    return HttpResponse.json(
      {
        id: invoiceId,
        customer_id: "cust-1",
        doc_number: "I-001",
        title: "Spring cleanup",
        status: "sent",
        total_amount: 120,
        notes: "Thanks for your business",
        due_date: "2026-04-19",
        shared_at: "2026-03-20T00:15:00.000Z",
        share_token: "invoice-share-token-1",
        source_document_id: "quote-1",
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
        updated_at: "2026-03-20T00:15:00.000Z",
      },
      { status: 200 },
    );
  }),

  http.post("/api/invoices/:id/send-email", ({ request, params }) => {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    const invoiceId = String(params.id);
    return HttpResponse.json(
      {
        id: `job-email-invoice-${invoiceId}`,
        user_id: "user-1",
        document_id: invoiceId,
        job_type: "email",
        status: "pending",
        attempts: 0,
        terminal_error: null,
        extraction_result: null,
        quote_id: null,
        created_at: "2026-03-20T00:00:00.000Z",
        updated_at: "2026-03-20T00:00:00.000Z",
      },
      { status: 202 },
    );
  }),
];
