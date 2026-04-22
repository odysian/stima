import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/shared/components/Button";

describe("Button", () => {
  it("renders primary variant by default and merges className", () => {
    render(<Button className="w-full">Create quote</Button>);

    const button = screen.getByRole("button", { name: "Create quote" });
    expect(button).toHaveClass("forest-gradient", "text-on-primary", "rounded-[var(--radius-document)]", "w-full");
  });

  it("renders all variants with tokenized classes", () => {
    render(
      <>
        <Button variant="secondary">Secondary</Button>
        <Button variant="tonal">Tonal</Button>
        <Button variant="destructive">Delete</Button>
        <Button variant="ghost">Back</Button>
        <Button variant="iconButton" aria-label="Close dialog">
          <span className="material-symbols-outlined">close</span>
        </Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "Secondary" })).toHaveClass("bg-surface-container-high");
    expect(screen.getByRole("button", { name: "Tonal" })).toHaveClass("bg-primary/15");
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("border-secondary", "text-secondary");
    expect(screen.getByRole("button", { name: "Back" })).toHaveClass("text-on-surface-variant");
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveClass("rounded-full", "min-h-12");
  });

  it("renders leading and trailing icon slots", () => {
    render(
      <Button
        leadingIcon={<span data-testid="leading-icon">left</span>}
        trailingIcon={<span data-testid="trailing-icon">right</span>}
      >
        Continue
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByTestId("leading-icon")).toBeInTheDocument();
    expect(screen.getByTestId("trailing-icon")).toBeInTheDocument();
  });

  it("shows an animated spinner and disables button when loading", () => {
    const onClick = vi.fn();
    render(
      <Button isLoading onClick={onClick}>
        Submit
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Submit Loading" });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(screen.getByTestId("button-spinner")).toHaveClass("animate-spin");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("throws if iconButton is rendered without an aria-label", () => {
    expect(() =>
      render(
        // @ts-expect-error: this intentionally exercises runtime guardrails for missing aria-label.
        <Button variant="iconButton">
          <span className="material-symbols-outlined">close</span>
        </Button>,
      ),
    ).toThrow("requires an aria-label");
  });
});
