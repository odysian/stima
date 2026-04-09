import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LineItemEditSheet } from "@/features/quotes/components/LineItemEditSheet";
import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";

function makeLineItem(overrides: Partial<LineItemDraftWithFlags> = {}): LineItemDraftWithFlags {
  return {
    description: "Brown mulch",
    details: "5 yards",
    price: 120,
    flagged: true,
    flagReason: "Needs review",
    ...overrides,
  };
}

describe("LineItemEditSheet", () => {
  it("renders edit mode with current values and focuses description", () => {
    render(
      <LineItemEditSheet
        open
        mode="edit"
        initialLineItem={makeLineItem()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: /edit line item/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toHaveValue("Brown mulch");
    expect(screen.getByLabelText(/details/i)).toHaveValue("5 yards");
    expect(screen.getByLabelText(/price/i)).toHaveValue("120");
    expect(screen.getByLabelText(/description/i)).toHaveFocus();
    expect(screen.getByRole("button", { name: /delete line item/i })).toBeInTheDocument();
  });

  it("renders add mode with empty fields", () => {
    render(
      <LineItemEditSheet
        open
        mode="add"
        initialLineItem={makeLineItem({ description: "", details: null, price: null })}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: /add line item/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toHaveValue("");
    expect(screen.getByLabelText(/details/i)).toHaveValue("");
    expect(screen.getByLabelText(/price/i)).toHaveValue("");
    expect(screen.queryByRole("button", { name: /delete line item/i })).not.toBeInTheDocument();
  });

  it("validates required description and blocks save", () => {
    const onSave = vi.fn();

    render(
      <LineItemEditSheet
        open
        mode="edit"
        initialLineItem={makeLineItem()}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Description is required.");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves with nullable price and trimmed values", () => {
    const onSave = vi.fn();

    render(
      <LineItemEditSheet
        open
        mode="edit"
        initialLineItem={makeLineItem()}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: " Premium mulch " } });
    fireEvent.change(screen.getByLabelText(/details/i), { target: { value: " 6 yards " } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith({
      description: "Premium mulch",
      details: "6 yards",
      price: null,
      flagged: true,
      flagReason: "Needs review",
    });
  });

  it("dismisses via cancel, escape, and backdrop", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <LineItemEditSheet
        open
        mode="edit"
        initialLineItem={makeLineItem()}
        onClose={onClose}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    fireEvent.keyDown(screen.getByLabelText(/description/i), { key: "Escape" });
    await user.click(screen.getByTestId("line-item-edit-sheet-overlay"));

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("fires onDelete in edit mode", () => {
    const onDelete = vi.fn();

    render(
      <LineItemEditSheet
        open
        mode="edit"
        initialLineItem={makeLineItem()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /delete line item/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
