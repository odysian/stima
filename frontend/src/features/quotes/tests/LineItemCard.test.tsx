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
        onDelete={vi.fn()}
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
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("REVIEW")).toBeInTheDocument();
    expect(
      screen.getByText("Spoken amount was interpreted as dollars instead of cents."),
    ).toBeInTheDocument();
  });

  it("renders em dash when price is blank", () => {
    render(
      <LineItemCard
        description="Cleanup labor"
        details="No separate charge"
        price={null}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
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
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit line item brown mulch/i }));
    expect(onEditMock).toHaveBeenCalledTimes(1);
  });

  it("shows overflow actions for edit and delete", () => {
    render(
      <LineItemCard
        description="Brown mulch"
        details="5 yards"
        price={120}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /line item actions for brown mulch/i }));
    expect(screen.getByRole("menuitem", { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /delete/i })).toBeInTheDocument();
  });
});
