import { describe, expect, it } from "vitest";

import { buildDraftSnapshot } from "@/features/quotes/utils/reviewScreenState";

describe("reviewScreenState", () => {
  it("keeps invalid-but-nonblank line items in draft snapshots", () => {
    const snapshot = buildDraftSnapshot({
      title: "Quote title",
      transcript: "Captured notes",
      lineItems: [
        { description: "", details: "Has details", price: null },
        { description: "", details: null, price: 25 },
        { description: "", details: null, price: null },
      ],
      total: 25,
      taxRate: null,
      discountType: null,
      discountValue: null,
      depositAmount: null,
      notes: "",
    });

    expect(snapshot.lineItems).toEqual([
      { description: "", details: "Has details", price: null, price_status: "unknown" },
      { description: "", details: null, price: 25, price_status: "priced" },
    ]);
  });
});
