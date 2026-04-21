import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DocumentHeroCard } from "@/ui/DocumentHeroCard";

describe("DocumentHeroCard", () => {
  it("renders quote hero without linked document or pricing breakdown", () => {
    render(
      <DocumentHeroCard
        documentLabel="QUOTE"
        status="draft"
        clientName="Ada Lovelace"
        clientContact="+1-555-0100"
        totalAmount={120}
        taxRate={null}
        discountType={null}
        discountValue={null}
        depositAmount={null}
        lineItemPrices={[120]}
        linkedDocument={null}
      />,
    );

    expect(screen.getByText("CLIENT")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("+1-555-0100")).toBeInTheDocument();
    expect(screen.getByText("QUOTE")).toBeInTheDocument();
    expect(screen.getByText("TOTAL AMOUNT")).toBeInTheDocument();
    expect(screen.getByText("$120.00")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.queryByText("DUE DATE")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open linked/i })).not.toBeInTheDocument();
  });

  it("renders invoice due date fallback and wires linked action click", () => {
    const onOpenLinkedQuote = vi.fn();
    render(
      <DocumentHeroCard
        documentLabel="INVOICE"
        status="sent"
        clientName="Grace Hopper"
        clientContact="grace@example.com"
        totalAmount={450}
        taxRate={null}
        discountType={null}
        discountValue={null}
        depositAmount={null}
        lineItemPrices={[450]}
        dueDate={null}
        linkedDocument={{
          actionLabel: "Open linked quote",
          actionAriaLabel: "Open linked quote Q-001",
          onClick: onOpenLinkedQuote,
        }}
      />,
    );

    expect(screen.getByText("DUE DATE")).toBeInTheDocument();
    expect(screen.getByText("No due date")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /open linked quote q-001/i });
    fireEvent.click(button);
    expect(onOpenLinkedQuote).toHaveBeenCalledTimes(1);
  });

  it("renders pricing breakdown rows when pricing metadata is present", () => {
    render(
      <DocumentHeroCard
        documentLabel="QUOTE"
        status="ready"
        clientName="Katherine Johnson"
        clientContact="kj@example.com"
        totalAmount={99}
        taxRate={0.1}
        discountType="fixed"
        discountValue={10}
        depositAmount={40}
        lineItemPrices={[100]}
      />,
    );

    expect(screen.getByText("TOTAL")).toBeInTheDocument();
    expect(screen.getByText("Subtotal")).toBeInTheDocument();
    expect(screen.getByText("Discount")).toBeInTheDocument();
    expect(screen.getByText("Tax")).toBeInTheDocument();
    expect(screen.getByText("Deposit")).toBeInTheDocument();
    expect(screen.getByText("Balance Due")).toBeInTheDocument();
  });
});
