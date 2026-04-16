import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TotalAmountSection } from "@/features/quotes/components/TotalAmountSection";

describe("TotalAmountSection", () => {
  it("renders line-item sum and forwards subtotal edits", () => {
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

    expect(screen.getByText("Line Item Sum")).toBeInTheDocument();
    expect(screen.getByText("$120.00")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/total amount/i), { target: { value: "150" } });
    expect(onTotalChange).toHaveBeenCalledWith(150);
  });
});
