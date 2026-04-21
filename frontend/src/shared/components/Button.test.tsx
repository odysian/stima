import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/shared/components/Button";

describe("Button", () => {
  it("renders primary variant by default and merges className", () => {
    render(<Button className="w-full">Create quote</Button>);

    const button = screen.getByRole("button", { name: "Create quote" });
    expect(button).toHaveClass("forest-gradient", "text-on-primary", "rounded-[var(--radius-document)]", "w-full");
  });

  it("renders destructive variant styles", () => {
    render(<Button variant="destructive">Delete</Button>);

    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("border-secondary", "text-secondary");
  });

  it("renders ghost variant styles", () => {
    render(<Button variant="ghost">Back</Button>);

    expect(screen.getByRole("button", { name: "Back" })).toHaveClass("p-2", "rounded-full");
  });

  it("shows loading label and disables button when loading", () => {
    const onClick = vi.fn();
    render(
      <Button isLoading onClick={onClick}>
        Submit
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Loading..." });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });
});
