import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Input } from "@/shared/components/Input";

describe("Input", () => {
  it("renders labeled input when label and id are provided", () => {
    render(<Input label="Email" id="email" value="" onChange={vi.fn()} />);

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("id", "email");
    expect(input).toHaveClass("bg-transparent");
    expect(input.closest("div")).toHaveClass("rounded-[var(--radius-document)]");
  });

  it("renders input without label and id when omitted", () => {
    render(<Input placeholder="Search quotes" value="" onChange={vi.fn()} />);

    const input = screen.getByRole("textbox");
    expect(screen.queryByText("Search quotes")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("id");
    expect(input).toHaveAttribute("placeholder", "Search quotes");
  });

  it("merges custom className and renders errors", () => {
    const onChange = vi.fn();
    render(
      <Input
        label="Customer Name"
        id="customer-name"
        value="Alice"
        onChange={onChange}
        className="custom-input"
        error="Name is required"
      />,
    );

    const input = screen.getByLabelText("Customer Name");
    fireEvent.change(input, { target: { value: "Bob" } });

    expect(input).toHaveClass("custom-input");
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("renders hint text, adornments, and aria-describedby wiring", () => {
    render(
      <Input
        id="amount"
        label="Amount"
        value="100"
        onChange={vi.fn()}
        hint="USD only"
        startAdornment="$"
        endAdornment="per hour"
      />,
    );

    const input = screen.getByLabelText("Amount");
    expect(input).toHaveAttribute("aria-describedby", "amount-hint");
    expect(screen.getByText("USD only")).toHaveAttribute("id", "amount-hint");
    expect(screen.getByText("$")).toBeInTheDocument();
    expect(screen.getByText("per hour")).toBeInTheDocument();
  });

  it("supports invalid visuals without error text", () => {
    render(
      <Input
        id="zip-code"
        label="Zip code"
        value="12"
        onChange={vi.fn()}
        hint="Use five digits"
        invalid
      />,
    );

    const input = screen.getByLabelText("Zip code");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Zip code")).toHaveClass("text-error");
    expect(screen.getByText("Use five digits")).toHaveClass("text-error");
  });
});
