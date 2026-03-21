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

  it("renders inline flag warning with reason when flagged", () => {
    render(
      <LineItemRow
        rowId="line-item-10"
        item={{
          description: "Mulch",
          details: "5 yards",
          price: 120,
          flagged: true,
          flagReason: "Unit phrasing may be ambiguous",
        }}
        onChange={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Unit phrasing may be ambiguous")).toBeInTheDocument();
  });

  it("renders fallback inline warning when flagged without reason", () => {
    render(
      <LineItemRow
        rowId="line-item-11"
        item={{ description: "Mulch", details: "5 yards", price: 120, flagged: true, flagReason: null }}
        onChange={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("This item may need review")).toBeInTheDocument();
  });

  it("does not render warning when item is not flagged", () => {
    render(
      <LineItemRow
        rowId="line-item-12"
        item={{ description: "Mulch", details: "5 yards", price: 120, flagged: false }}
        onChange={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.queryByText("This item may need review")).not.toBeInTheDocument();
  });
});
