import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { TotalAmountSection } from "@/features/quotes/components/TotalAmountSection";
import type { DiscountType } from "@/shared/lib/pricing";

function renderSection({
  initialTaxRate = null,
  initialDiscountType = null,
  initialDiscountValue = null,
  initialDepositAmount = null,
  suggestedTaxRate = 0.0825,
}: {
  initialTaxRate?: number | null;
  initialDiscountType?: DiscountType | null;
  initialDiscountValue?: number | null;
  initialDepositAmount?: number | null;
  suggestedTaxRate?: number | null;
} = {}): void {
  function Wrapper(): React.ReactElement {
    const [total, setTotal] = useState<number | null>(100);
    const [taxRate, setTaxRate] = useState<number | null>(initialTaxRate);
    const [discountType, setDiscountType] = useState<DiscountType | null>(initialDiscountType);
    const [discountValue, setDiscountValue] = useState<number | null>(initialDiscountValue);
    const [depositAmount, setDepositAmount] = useState<number | null>(initialDepositAmount);

    return (
      <TotalAmountSection
        lineItemSum={100}
        total={total}
        taxRate={taxRate}
        discountType={discountType}
        discountValue={discountValue}
        depositAmount={depositAmount}
        suggestedTaxRate={suggestedTaxRate}
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
  it("uses the token-backed surface for the total amount input", () => {
    renderSection();

    expect(screen.getByRole("spinbutton", { name: /total amount/i })).toHaveClass(
      "bg-surface-container-lowest",
    );
  });

  it("keeps optional pricing discoverable while collapsed when nothing is active", () => {
    renderSection({ suggestedTaxRate: null });

    expect(screen.getByRole("button", { name: /optional pricing/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("checkbox", { name: "Discount" })).not.toBeInTheDocument();
  });

  it("auto-expands optional pricing when a suggested tax rate exists and shows percent units", () => {
    renderSection();

    expect(screen.getByText(/optional pricing/i)).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /suggested tax/i })).toHaveValue(8.25);
    expect(screen.getByText("%")).toBeInTheDocument();
  });

  it("shows editable inputs without seeding zero values and applies the suggested tax rate", () => {
    renderSection();

    fireEvent.click(screen.getByRole("checkbox", { name: "Discount" }));
    const discountInput = screen.getByPlaceholderText("25") as HTMLInputElement;
    expect(discountInput.value).toBe("");

    fireEvent.click(screen.getByRole("checkbox", { name: "Tax" }));
    const taxInput = screen.getByRole("spinbutton", { name: /tax rate/i }) as HTMLInputElement;
    expect(taxInput.value).toBe("8.25");

    fireEvent.click(screen.getByRole("checkbox", { name: "Deposit" }));
    const depositInput = screen.getByPlaceholderText("50") as HTMLInputElement;
    expect(depositInput.value).toBe("");
  });
});
