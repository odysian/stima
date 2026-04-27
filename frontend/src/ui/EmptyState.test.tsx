import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "@/ui/EmptyState";

describe("EmptyState", () => {
  it("renders icon, title, and body", () => {
    const { container } = render(<EmptyState icon="inbox_out" title="No items" body="Try adding one." />);

    expect(screen.getByText("No items")).toBeInTheDocument();
    expect(screen.getByText("Try adding one.")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders action content when provided", () => {
    render(
      <EmptyState
        title="No quotes yet."
        action={<button type="button">Create Quote</button>}
      />,
    );

    expect(screen.getByRole("button", { name: "Create Quote" })).toBeInTheDocument();
  });

  it("uses attention tone styles when selected", () => {
    const { container } = render(
      <EmptyState title="Nothing here" tone="attention" />,
    );

    expect(container.firstChild).toHaveClass("bg-warning-container/40");
  });
});
