import { describe, expect, it } from "vitest";

import { syncDraftTotalWithLineItems } from "@/features/quotes/utils/lineItemDraftTotals";
import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";

function makeLineItem(overrides: Partial<LineItemDraftWithFlags>): LineItemDraftWithFlags {
  return {
    description: "Work item",
    details: null,
    price: null,
    ...overrides,
  };
}

describe("lineItemDraftTotals", () => {
  it("re-syncs subtotal from priced rows when remaining null rows are included", () => {
    const currentLineItems: LineItemDraftWithFlags[] = [
      makeLineItem({ description: "Mulch", price: 120, priceStatus: "priced" }),
      makeLineItem({ description: "Cleanup", details: "Included / no charge", price: null, priceStatus: "included" }),
    ];
    const nextLineItems: LineItemDraftWithFlags[] = [
      makeLineItem({ description: "Mulch", price: 150, priceStatus: "priced" }),
      makeLineItem({ description: "Cleanup", details: "Included / no charge", price: null, priceStatus: "included" }),
    ];

    const nextTotal = syncDraftTotalWithLineItems(
      { lineItems: currentLineItems, total: 120 },
      nextLineItems,
    );

    expect(nextTotal).toBe(150);
  });

  it("does not re-sync subtotal when unknown pricing rows are present", () => {
    const currentLineItems: LineItemDraftWithFlags[] = [
      makeLineItem({ description: "Mulch", price: 120, priceStatus: "priced" }),
      makeLineItem({ description: "Edging", details: "Need to confirm price", price: null, priceStatus: "unknown" }),
    ];
    const nextLineItems: LineItemDraftWithFlags[] = [
      makeLineItem({ description: "Mulch", price: 160, priceStatus: "priced" }),
      makeLineItem({ description: "Edging", details: "Need to confirm price", price: null, priceStatus: "unknown" }),
    ];

    const nextTotal = syncDraftTotalWithLineItems(
      { lineItems: currentLineItems, total: 120 },
      nextLineItems,
    );

    expect(nextTotal).toBe(120);
  });

  it("clears subtotal when all substantive rows are included", () => {
    const currentLineItems: LineItemDraftWithFlags[] = [
      makeLineItem({ description: "Mulch", price: 120, priceStatus: "priced" }),
    ];
    const nextLineItems: LineItemDraftWithFlags[] = [
      makeLineItem({ description: "Cleanup", details: "Included / no charge", price: null, priceStatus: "included" }),
    ];

    const nextTotal = syncDraftTotalWithLineItems(
      { lineItems: currentLineItems, total: 120 },
      nextLineItems,
    );

    expect(nextTotal).toBeNull();
  });
});
