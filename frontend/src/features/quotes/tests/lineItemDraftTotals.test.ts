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
  it("re-syncs subtotal from priced rows while ignoring blank-price rows", () => {
    const currentLineItems: LineItemDraftWithFlags[] = [
      makeLineItem({ description: "Mulch", price: 120 }),
      makeLineItem({ description: "Cleanup", details: "Included / no charge", price: null }),
    ];
    const nextLineItems: LineItemDraftWithFlags[] = [
      makeLineItem({ description: "Mulch", price: 150 }),
      makeLineItem({ description: "Cleanup", details: "Included / no charge", price: null }),
    ];

    const nextTotal = syncDraftTotalWithLineItems(
      { lineItems: currentLineItems, total: 120 },
      nextLineItems,
    );

    expect(nextTotal).toBe(150);
  });

  it("keeps custom total when current total is already decoupled from line items", () => {
    const currentLineItems: LineItemDraftWithFlags[] = [
      makeLineItem({ description: "Mulch", price: 120 }),
      makeLineItem({ description: "Edging", details: "Need to confirm price", price: null }),
    ];
    const nextLineItems: LineItemDraftWithFlags[] = [
      makeLineItem({ description: "Mulch", price: 160 }),
      makeLineItem({ description: "Edging", details: "Need to confirm price", price: null }),
    ];

    const nextTotal = syncDraftTotalWithLineItems(
      { lineItems: currentLineItems, total: 999 },
      nextLineItems,
    );

    expect(nextTotal).toBe(999);
  });

  it("clears subtotal when all substantive rows are blank-priced", () => {
    const currentLineItems: LineItemDraftWithFlags[] = [
      makeLineItem({ description: "Mulch", price: 120 }),
    ];
    const nextLineItems: LineItemDraftWithFlags[] = [
      makeLineItem({ description: "Cleanup", details: "Included / no charge", price: null }),
    ];

    const nextTotal = syncDraftTotalWithLineItems(
      { lineItems: currentLineItems, total: 120 },
      nextLineItems,
    );

    expect(nextTotal).toBeNull();
  });
});
