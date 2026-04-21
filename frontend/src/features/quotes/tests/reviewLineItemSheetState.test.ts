import { describe, expect, it } from "vitest";

import { applyLineItemReorder, applyLineItemSheetSave } from "@/features/quotes/components/reviewLineItemSheetState";

describe("reviewLineItemSheetState", () => {
  it("clears spoken money correction flag when edited price changes", () => {
    const nextDraft = applyLineItemSheetSave(
      {
        lineItems: [
          {
            description: "Mulch",
            details: "front beds",
            price: 450,
            flagged: true,
            flagReason: "spoken_money_correction",
          },
        ],
        total: 450,
      },
      { mode: "edit", index: 0 },
      {
        description: "Mulch",
        details: "front beds",
        price: 500,
        flagged: true,
        flagReason: "spoken_money_correction",
      },
    );

    expect(nextDraft.lineItems[0]).toMatchObject({
      price: 500,
      flagged: false,
      flagReason: null,
    });
  });

  it("keeps spoken money correction flag when price is unchanged", () => {
    const nextDraft = applyLineItemSheetSave(
      {
        lineItems: [
          {
            description: "Mulch",
            details: "front beds",
            price: 450,
            flagged: true,
            flagReason: "spoken_money_correction",
          },
        ],
        total: 450,
      },
      { mode: "edit", index: 0 },
      {
        description: "Mulch",
        details: "front beds and driveway",
        price: 450,
        flagged: true,
        flagReason: "spoken_money_correction",
      },
    );

    expect(nextDraft.lineItems[0]).toMatchObject({
      price: 450,
      flagged: true,
      flagReason: "spoken_money_correction",
    });
  });

  it("keeps a manually dismissed review flag cleared when price is unchanged", () => {
    const nextDraft = applyLineItemSheetSave(
      {
        lineItems: [
          {
            description: "Mulch",
            details: "front beds",
            price: 450,
            flagged: true,
            flagReason: "spoken_money_correction",
          },
        ],
        total: 450,
      },
      { mode: "edit", index: 0 },
      {
        description: "Mulch",
        details: "front beds",
        price: 450,
        flagged: false,
        flagReason: null,
      },
    );

    expect(nextDraft.lineItems[0]).toMatchObject({
      price: 450,
      flagged: false,
      flagReason: null,
    });
  });

  it("reorders line items in local draft order", () => {
    const nextDraft = applyLineItemReorder(
      {
        lineItems: [
          { description: "First", details: null, price: 10 },
          { description: "Second", details: null, price: 20 },
          { description: "Third", details: null, price: 30 },
        ],
        total: 60,
      },
      0,
      2,
    );

    expect(nextDraft.lineItems.map((lineItem) => lineItem.description)).toEqual([
      "Second",
      "Third",
      "First",
    ]);
  });
});
