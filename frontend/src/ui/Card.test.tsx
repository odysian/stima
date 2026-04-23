import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card } from "@/ui/Card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("applies primary accent border when accent is primary", () => {
    const { container } = render(<Card accent="primary">content</Card>);
    expect(container.firstChild).toHaveClass("border-primary");
    expect(container.firstChild).toHaveClass("border-l-4");
  });

  it("applies warning accent border when accent is warn", () => {
    const { container } = render(<Card accent="warn">content</Card>);
    expect(container.firstChild).toHaveClass("border-warning-accent");
    expect(container.firstChild).toHaveClass("border-l-4");
  });

  it("applies no accent border when accent is omitted", () => {
    const { container } = render(<Card>content</Card>);
    expect(container.firstChild).not.toHaveClass("border-l-4");
  });

  it("forwards className override", () => {
    const { container } = render(<Card className="custom-class">content</Card>);
    expect(container.firstChild).toHaveClass("custom-class");
  });
});
