import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusPill } from "@/ui/StatusPill";
import type { StatusPillVariant } from "@/ui/StatusPill";

const variants: StatusPillVariant[] = [
  "draft",
  "ready",
  "shared",
  "viewed",
  "approved",
  "declined",
  "sent",
  "paid",
  "void",
  "needs_customer",
];

describe("StatusPill", () => {
  it.each(variants)("renders label for variant %s", (variant) => {
    render(<StatusPill variant={variant} />);
    const pill = screen.getByText(/./i, { selector: "span" });
    expect(pill).toBeInTheDocument();
  });

  it("renders 'Draft' label for draft variant", () => {
    render(<StatusPill variant="draft" />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("renders 'Needs customer' label for needs_customer variant", () => {
    render(<StatusPill variant="needs_customer" />);
    expect(screen.getByText("Needs customer")).toBeInTheDocument();
  });

  it("applies warning styles for needs_customer variant", () => {
    render(<StatusPill variant="needs_customer" />);
    const pill = screen.getByText("Needs customer");
    expect(pill).toHaveClass("bg-warning-container");
    expect(pill).toHaveClass("text-warning");
  });

  it("applies correct className for viewed variant", () => {
    render(<StatusPill variant="viewed" />);
    const pill = screen.getByText("Viewed");
    expect(pill).toHaveClass("bg-warning-container");
    expect(pill).toHaveClass("text-warning");
  });

  it("applies correct className for approved variant", () => {
    render(<StatusPill variant="approved" />);
    const pill = screen.getByText("Approved");
    expect(pill).toHaveClass("bg-success-container");
    expect(pill).toHaveClass("text-success");
  });

  it("applies correct className for declined variant", () => {
    render(<StatusPill variant="declined" />);
    const pill = screen.getByText("Declined");
    expect(pill).toHaveClass("bg-error-container");
    expect(pill).toHaveClass("text-error");
  });

  it("renders as a span element", () => {
    const { container } = render(<StatusPill variant="draft" />);
    expect(container.firstChild?.nodeName).toBe("SPAN");
  });
});
