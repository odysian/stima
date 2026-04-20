import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReviewLineItemsSection } from "@/features/quotes/components/ReviewLineItemsSection";
import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";

const SAMPLE_LINE_ITEMS: LineItemDraftWithFlags[] = [
  {
    description: "Brown mulch",
    details: "5 yards",
    price: 120,
  },
  {
    description: "Cleanup labor",
    details: null,
    price: 80,
  },
];

function renderSection(options?: { isInteractionLocked?: boolean; onEditLineItem?: (index: number) => void }): void {
  render(
    <ReviewLineItemsSection
      lineItems={SAMPLE_LINE_ITEMS}
      isInteractionLocked={options?.isInteractionLocked ?? false}
      onEditLineItem={options?.onEditLineItem ?? vi.fn()}
      onReorderLineItems={vi.fn()}
      onAddLineItem={vi.fn()}
    />,
  );
}

describe("ReviewLineItemsSection", () => {
  it("hides drag and row overflow actions in default mode, and row tap opens edit", () => {
    const onEditLineItem = vi.fn();
    renderSection({ onEditLineItem });

    expect(screen.getByRole("button", { name: "Reorder" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reorder line item 1: brown mulch/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /line item actions for brown mulch/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /edit line item 1: brown mulch/i }));
    expect(onEditLineItem).toHaveBeenCalledWith(0);
  });

  it("switches to Done mode, shows drag handles, hides row overflow, and blocks row edit taps", () => {
    const onEditLineItem = vi.fn();
    renderSection({ onEditLineItem });

    fireEvent.click(screen.getByRole("button", { name: "Reorder" }));

    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reorder line item 1: brown mulch/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /line item actions for brown mulch/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit line item 1: brown mulch/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /edit line item 1: brown mulch/i }));
    expect(onEditLineItem).not.toHaveBeenCalled();
  });

  it("returns to default mode after Done", () => {
    const onEditLineItem = vi.fn();
    renderSection({ onEditLineItem });

    fireEvent.click(screen.getByRole("button", { name: "Reorder" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(screen.getByRole("button", { name: "Reorder" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reorder line item 1: brown mulch/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /line item actions for brown mulch/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /edit line item 1: brown mulch/i }));
    expect(onEditLineItem).toHaveBeenCalledWith(0);
  });
});
