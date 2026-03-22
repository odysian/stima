import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Input } from "@/shared/components/Input";

describe("Input", () => {
  it("renders labeled input when label and id are provided", () => {
    render(<Input label="Email" id="email" value="" onChange={vi.fn()} />);

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("id", "email");
    expect(input).toHaveClass("bg-surface-container-high", "focus:ring-primary/30");
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
  });
});
