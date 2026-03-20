import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { customerService } from "@/features/customers/services/customerService";
import type { CustomerCreateRequest } from "@/features/customers/types/customer.types";
import { clearCsrfToken, setCsrfToken } from "@/shared/lib/http";
import { server } from "@/shared/tests/mocks/server";

describe("customerService integration (MSW)", () => {
  afterEach(() => {
    clearCsrfToken();
  });

  it("listCustomers returns parsed customer list", async () => {
    const customers = await customerService.listCustomers();

    expect(customers).toEqual([
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
    ]);
  });

  it("createCustomer sends CSRF header and returns created customer", async () => {
    setCsrfToken("integration-csrf-token");

    let capturedCsrfHeader: string | null = null;

    server.use(
      http.post("/api/customers", async ({ request }) => {
        capturedCsrfHeader = request.headers.get("X-CSRF-Token");
        const body = (await request.json()) as CustomerCreateRequest;

        return HttpResponse.json(
          {
            id: "cust-created",
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
    );

    const created = await customerService.createCustomer({
      name: "New Customer",
      phone: "555-0109",
    });

    expect(capturedCsrfHeader).toBe("integration-csrf-token");
    expect(created).toEqual({
      id: "cust-created",
      name: "New Customer",
      phone: "555-0109",
      email: null,
      address: null,
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:00:00.000Z",
    });
  });

  it("createCustomer propagates CSRF validation errors when token is missing", async () => {
    clearCsrfToken();

    await expect(customerService.createCustomer({ name: "No CSRF" })).rejects.toThrow(
      "CSRF token missing",
    );
  });

  it("getCustomer returns parsed customer response", async () => {
    server.use(
      http.get("/api/customers/:customerId", ({ params }) => {
        return HttpResponse.json({
          id: params.customerId,
          name: "Fetched Customer",
          phone: null,
          email: "fetched@example.com",
          address: null,
          created_at: "2026-03-20T00:00:00.000Z",
          updated_at: "2026-03-20T00:00:00.000Z",
        });
      }),
    );

    const customer = await customerService.getCustomer("cust-42");

    expect(customer).toEqual({
      id: "cust-42",
      name: "Fetched Customer",
      phone: null,
      email: "fetched@example.com",
      address: null,
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:00:00.000Z",
    });
  });
});
