import { describe, expect, it } from "vitest";

import { getPricingValidationMessage } from "@/shared/lib/pricing";

describe("pricing validation", () => {
  it("rejects a discount value without a discount type even when the value is zero", () => {
    expect(
      getPricingValidationMessage({
        totalAmount: 100,
        taxRate: null,
        discountType: null,
        discountValue: 0,
        depositAmount: null,
      }),
    ).toBe("Choose a discount type or clear the discount value.");
  });

  it("treats zero tax and deposit values as inactive pricing controls", () => {
    expect(
      getPricingValidationMessage({
        totalAmount: null,
        taxRate: 0,
        discountType: null,
        discountValue: null,
        depositAmount: 0,
      }),
    ).toBeNull();
  });

  it("rejects a deposit that exceeds the computed total amount", () => {
    expect(
      getPricingValidationMessage({
        totalAmount: 100,
        taxRate: 0.1,
        discountType: "fixed",
        discountValue: 10,
        depositAmount: 100,
      }),
    ).toBe("Deposit cannot exceed the total amount.");
  });
});
