import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReviewCustomerRow } from "@/features/quotes/components/ReviewCustomerRow";

describe("ReviewCustomerRow", () => {
  it("applies warning pulse classes when customer assignment is required", () => {
    render(
      <ReviewCustomerRow
        customerName={null}
        requiresCustomerAssignment
        canReassignCustomer
        isInteractionLocked={false}
        onRequestAssignment={vi.fn()}
      />,
    );

    const assignmentButton = screen.getByRole("button", { name: /customer: unassigned/i });
    expect(assignmentButton).toHaveClass(
      "ring-2",
      "ring-warning-accent/60",
      "animate-pulse",
      "[animation-iteration-count:3]",
    );
  });

  it("does not apply warning pulse classes when a customer is already assigned", () => {
    render(
      <ReviewCustomerRow
        customerName="Alice Johnson"
        requiresCustomerAssignment={false}
        canReassignCustomer
        isInteractionLocked={false}
        onRequestAssignment={vi.fn()}
      />,
    );

    const assignmentButton = screen.getByRole("button", { name: /alice johnson/i });
    expect(assignmentButton).not.toHaveClass(
      "ring-2",
      "ring-warning-accent/60",
      "animate-pulse",
      "[animation-iteration-count:3]",
    );
  });
});
