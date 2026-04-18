import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LineItemCard } from "@/features/quotes/components/LineItemCard";

describe("LineItemCard", () => {
  it("renders description, details, and price", () => {
    render(
      <LineItemCard
        description="Brown mulch"
        details="5 yards"
        price={120}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText("Brown mulch")).toBeInTheDocument();
    expect(screen.getByText("5 yards")).toBeInTheDocument();
    expect(screen.getByText("$120.00")).toBeInTheDocument();
  });

  it("shows flagged styling and review badge when flagged", () => {
    render(
      <LineItemCard
        description="Brown mulch"
        details="5 yards"
        price={120}
        flagged
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /brown mulch/i })).toHaveClass("border-warning-accent/20");
    expect(screen.getByText("REVIEW")).toBeInTheDocument();
  });

  it("renders em dash when price is blank", () => {
    render(
      <LineItemCard
        description="Cleanup labor"
        details="No separate charge"
        price={null}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("fires onClick when card is clicked", () => {
    const onClickMock = vi.fn();
    render(
      <LineItemCard
        description="Brown mulch"
        details="5 yards"
        price={120}
        onClick={onClickMock}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /brown mulch/i }));
    expect(onClickMock).toHaveBeenCalledTimes(1);
  });
});
