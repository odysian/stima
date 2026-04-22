import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NumericField } from "@/ui/NumericField";

describe("NumericField", () => {
  it("formats with locale separators on blur for money fields", () => {
    const onChange = vi.fn();
    render(
      <NumericField
        id="price"
        label="Price"
        value="1234.5"
        onChange={onChange}
        step={0.01}
        currencySymbol="$"
      />,
    );

    fireEvent.blur(screen.getByLabelText("Price"));

    expect(onChange).toHaveBeenCalledWith("1,234.50");
  });

  it("supports step controls", () => {
    const onChange = vi.fn();
    render(
      <NumericField
        id="amount"
        label="Amount"
        value="10"
        onChange={onChange}
        step={0.5}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /increase value/i }));
    fireEvent.click(screen.getByRole("button", { name: /decrease value/i }));

    expect(onChange).toHaveBeenNthCalledWith(1, "10.5");
    expect(onChange).toHaveBeenNthCalledWith(2, "9.5");
  });
});
