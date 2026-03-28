import { afterEach, describe, expect, it, vi } from "vitest";

import { publicService } from "@/features/public/services/publicService";

describe("publicService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches public quotes without cookies or CSRF headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          business_name: "Northline Landscaping",
          customer_name: "Taylor Morgan",
          doc_number: "Q-001",
          title: "Spring Cleanup",
          status: "viewed",
          total_amount: 425,
          notes: null,
          issued_date: "Mar 28, 2026",
          logo_url: "https://example.com/logo.png",
          download_url: "https://api.example.com/share/token-1",
          line_items: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await publicService.getQuote("token-1");

    expect(fetchMock).toHaveBeenCalledWith("/api/public/doc/token-1", {
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
  });

  it("surfaces 404 responses as PublicRequestError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(publicService.getQuote("missing-token")).rejects.toEqual(
      expect.objectContaining({
        name: "PublicRequestError",
        message: "Not found",
        status: 404,
      }),
    );
  });
});
