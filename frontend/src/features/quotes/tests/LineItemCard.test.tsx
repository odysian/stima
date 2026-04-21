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
        onEdit={vi.fn()}
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
        flagReason="spoken_money_correction"
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText("REVIEW")).toBeInTheDocument();
    expect(screen.queryByText("Spoken amount was interpreted as dollars instead of cents.")).not.toBeInTheDocument();
  });

  it("renders em dash when price is blank", () => {
    render(
      <LineItemCard
        description="Cleanup labor"
        details="No separate charge"
        price={null}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("fires onEdit when row body is clicked", () => {
    const onEditMock = vi.fn();
    render(
      <LineItemCard
        description="Brown mulch"
        details="5 yards"
        price={120}
        ariaLabel="Edit line item Brown mulch"
        onEdit={onEditMock}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit line item brown mulch/i }));
    expect(onEditMock).toHaveBeenCalledTimes(1);
  });

  it("hides drag, chevron, and overflow affordances in default mode", () => {
    render(
      <LineItemCard
        description="Brown mulch"
        details="5 yards"
        price={120}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /reorder line item brown mulch/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /line item actions for brown mulch/i })).not.toBeInTheDocument();
    expect(screen.queryByText("chevron_right")).not.toBeInTheDocument();
  });

  it("shows reorder affordances and blocks row editing while in reorder mode", () => {
    const onEditMock = vi.fn();
    render(
      <LineItemCard
        description="Brown mulch"
        details="5 yards"
        price={120}
        ariaLabel="Edit line item Brown mulch"
        isReorderMode
        onEdit={onEditMock}
      />,
    );

    const editRowButton = screen.getByRole("button", { name: /edit line item brown mulch/i });
    expect(editRowButton).toBeDisabled();
    expect(screen.getByRole("button", { name: /reorder line item brown mulch/i })).toBeInTheDocument();

    fireEvent.click(editRowButton);
    expect(onEditMock).not.toHaveBeenCalled();
  });

  it("does not render row overflow trigger while in reorder mode", () => {
    render(
      <LineItemCard
        description="Brown mulch"
        details="5 yards"
        price={120}
        isReorderMode
        onEdit={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /line item actions for brown mulch/i })).not.toBeInTheDocument();
  });
});
