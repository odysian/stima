import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

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
  it("renders line-item sum with a labeled total amount input", () => {
    renderSection();

    expect(screen.getByText("Line Item Sum")).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    const totalInput = screen.getByLabelText(/total amount/i) as HTMLInputElement;
    expect(totalInput).toHaveAttribute("id", "quote-total");
    expect(totalInput.value).toBe("100.00");
  });

  it("forwards total amount edits through onTotalChange", () => {
    const onTotalChange = vi.fn();

    render(
      <TotalAmountSection
        lineItemSum={120}
        total={120}
        taxRate={null}
        discountType={null}
        discountValue={null}
        depositAmount={null}
        onTotalChange={onTotalChange}
        onTaxRateChange={vi.fn()}
        onDiscountTypeChange={vi.fn()}
        onDiscountValueChange={vi.fn()}
        onDepositAmountChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/total amount/i), { target: { value: "150" } });
    expect(onTotalChange).toHaveBeenLastCalledWith(150);
  });

  it("keeps partial total text while typing, then normalizes to two decimals on blur", () => {
    renderSection();

    const totalInput = screen.getByLabelText(/total amount/i) as HTMLInputElement;
    fireEvent.focus(totalInput);
    fireEvent.change(totalInput, { target: { value: "4." } });
    expect(totalInput.value).toBe("4.");

    fireEvent.blur(totalInput);
    expect(totalInput.value).toBe("4.00");
  });

  it("normalizes decimal totals to two places after blur without injecting currency symbol", () => {
    renderSection();

    const totalInput = screen.getByLabelText(/total amount/i) as HTMLInputElement;
    fireEvent.focus(totalInput);
    fireEvent.change(totalInput, { target: { value: "4.5" } });
    fireEvent.blur(totalInput);

    expect(totalInput.value).toBe("4.50");
    expect(totalInput.value.includes("$")).toBe(false);
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

  it("does not pre-enable tax when taxRate is null, and pre-fills suggested value after enabling", () => {
    renderSection({ initialTaxRate: null, suggestedTaxRate: 0.0825 });

    fireEvent.click(screen.getByRole("button", { name: /optional pricing/i }));

    const taxCheckbox = screen.getByRole("checkbox", { name: "Tax" });
    expect(taxCheckbox).not.toBeChecked();
    expect(screen.queryByRole("textbox", { name: /tax rate/i })).not.toBeInTheDocument();

    fireEvent.click(taxCheckbox);

    const taxInput = screen.getByRole("textbox", { name: /tax rate/i }) as HTMLInputElement;
    expect(taxInput.value).toBe("8.25");
  });

  it("applies the suggested tax rate only after tax is enabled", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: /optional pricing/i }));

    expect(screen.queryByRole("textbox", { name: /tax rate/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Discount" }));
    const discountInput = screen.getByPlaceholderText("25") as HTMLInputElement;
    expect(discountInput.value).toBe("");

    fireEvent.click(screen.getByRole("checkbox", { name: "Tax" }));
    const taxInput = screen.getByRole("textbox", { name: /tax rate/i }) as HTMLInputElement;
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
