import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "@/shared/components/StatusBadge";

describe("StatusBadge", () => {
  it("renders draft variant styles", () => {
    render(<StatusBadge variant="draft" />);

    expect(screen.getByText("Draft")).toHaveClass("bg-neutral-container", "text-on-surface-variant");
  });

  it("renders ready variant styles", () => {
    render(<StatusBadge variant="ready" />);

    expect(screen.getByText("Ready")).toHaveClass("bg-success-container", "text-success");
  });

  it("renders shared variant styles", () => {
    render(<StatusBadge variant="shared" />);

    expect(screen.getByText("Shared")).toHaveClass("bg-info-container", "text-info");
  });

  it("renders viewed variant styles", () => {
    render(<StatusBadge variant="viewed" />);

    expect(screen.getByText("Viewed")).toHaveClass("bg-warning-container", "text-warning");
  });

  it("renders approved variant styles with an inline icon", () => {
    const { container } = render(<StatusBadge variant="approved" />);

    expect(screen.getByText("Approved")).toHaveClass("bg-success-container", "text-success");
    expect(container.querySelector(".material-symbols-outlined")).toHaveTextContent(
      "check_circle",
    );
  });

  it("renders declined variant styles", () => {
    render(<StatusBadge variant="declined" />);

    expect(screen.getByText("Declined")).toHaveClass("bg-error-container", "text-error");
  });
});
