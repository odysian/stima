import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { TotalAmountSection } from "@/features/quotes/components/TotalAmountSection";
import type { DiscountType } from "@/shared/lib/pricing";

function renderSection(): void {
  function Wrapper(): React.ReactElement {
    const [total, setTotal] = useState<number | null>(100);
    const [taxRate, setTaxRate] = useState<number | null>(null);
    const [discountType, setDiscountType] = useState<DiscountType | null>(null);
    const [discountValue, setDiscountValue] = useState<number | null>(null);
    const [depositAmount, setDepositAmount] = useState<number | null>(null);

    return (
      <TotalAmountSection
        lineItemSum={100}
        total={total}
        taxRate={taxRate}
        discountType={discountType}
        discountValue={discountValue}
        depositAmount={depositAmount}
        suggestedTaxRate={0.0825}
        onTotalChange={setTotal}
        onTaxRateChange={setTaxRate}
        onDiscountTypeChange={setDiscountType}
        onDiscountValueChange={setDiscountValue}
        onDepositAmountChange={setDepositAmount}
      />
    );
  }

  render(<Wrapper />);
}

describe("TotalAmountSection", () => {
  it("shows editable inputs without seeding zero values and applies the suggested tax rate", () => {
    renderSection();

    fireEvent.click(screen.getByRole("checkbox", { name: "Discount" }));
    const discountInput = screen.getByPlaceholderText("25") as HTMLInputElement;
    expect(discountInput.value).toBe("");

    fireEvent.click(screen.getByRole("checkbox", { name: "Tax" }));
    const taxInput = screen.getByPlaceholderText("8.25") as HTMLInputElement;
    expect(taxInput.value).toBe("8.25");

    fireEvent.click(screen.getByRole("checkbox", { name: "Deposit" }));
    const depositInput = screen.getByPlaceholderText("50") as HTMLInputElement;
    expect(depositInput.value).toBe("");
  });
});
