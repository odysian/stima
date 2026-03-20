import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LineItemRow } from "@/features/quotes/components/LineItemRow";

describe("LineItemRow", () => {
  it("associates labels and inputs using the stable rowId", () => {
    render(
      <LineItemRow
        rowId="line-item-7"
        item={{ description: "Mulch", details: "5 yards", price: 120 }}
        onChange={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Description")).toHaveAttribute("id", "line-item-7-description");
    expect(screen.getByLabelText("Details")).toHaveAttribute("id", "line-item-7-details");
    expect(screen.getByLabelText("Price")).toHaveAttribute("id", "line-item-7-price");
  });

  it("sets price to null when price input is cleared", () => {
    const onChangeMock = vi.fn();
    render(
      <LineItemRow
        rowId="line-item-8"
        item={{ description: "Mulch", details: null, price: 120 }}
        onChange={onChangeMock}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "" } });

    expect(onChangeMock).toHaveBeenCalledWith({
      description: "Mulch",
      details: null,
      price: null,
    });
  });

  it("renders row-level description error when provided", () => {
    render(
      <LineItemRow
        rowId="line-item-9"
        item={{ description: "", details: "Needs two workers", price: 45 }}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        descriptionError="Description is required for this row."
      />,
    );

    expect(screen.getByText("Description is required for this row.")).toBeInTheDocument();
  });
});
