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

  it("keeps optional pricing collapsed by default when only a suggested tax rate exists", () => {
    renderSection();

    expect(screen.getByRole("button", { name: /optional pricing/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("checkbox", { name: "Tax" })).not.toBeInTheDocument();
  });

  it("shows the suggested tax hint after manually opening the panel and applies the default when tax is enabled", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: /optional pricing/i }));

    expect(screen.getByRole("spinbutton", { name: /suggested tax/i })).toHaveValue(8.25);
    expect(screen.getByText("%")).toBeInTheDocument();

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

  it("forces optional pricing open only when an option is active and returns to collapsible state after clearing the last active option", () => {
    renderSection({ initialDiscountType: "fixed" });

    expect(screen.queryByRole("button", { name: /optional pricing/i })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Discount" })).toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: "Discount" }));

    expect(screen.getByRole("button", { name: /optional pricing/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("checkbox", { name: "Discount" })).not.toBeInTheDocument();
  });

  it("treats zero-valued pricing as active so the panel stays forced open", () => {
    renderSection({ initialDepositAmount: 0 });

    expect(screen.queryByRole("button", { name: /optional pricing/i })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Deposit" })).toBeChecked();
  });
});
