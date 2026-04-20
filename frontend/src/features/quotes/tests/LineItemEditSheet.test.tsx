import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  it("renders edit mode values, focuses description, and shows top-right trash", () => {
    render(
      <LineItemEditSheet
        open
        mode="edit"
        initialLineItem={makeLineItem()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: /edit line item/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toHaveValue("Brown mulch");
    expect(screen.getByLabelText(/details/i)).toHaveValue("5 yards");
    expect(screen.getByLabelText(/price/i)).toHaveValue("120");
    expect(screen.getByLabelText(/description/i)).toHaveFocus();
    expect(within(dialog).getByRole("button", { name: /delete line item/i })).toBeInTheDocument();
  });

  it("renders add mode without sheet trash", () => {
    render(
      <LineItemEditSheet
        open
        mode="add"
        initialLineItem={makeLineItem({ description: "", details: null, price: null })}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: /add line item/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toHaveValue("");
    expect(screen.getByLabelText(/details/i)).toHaveValue("");
    expect(screen.getByLabelText(/price/i)).toHaveValue("");
    expect(within(dialog).queryByRole("button", { name: /delete line item/i })).not.toBeInTheDocument();
  });

  it("blocks dismiss with a validation error when description is blank", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <LineItemEditSheet
        open
        mode="edit"
        initialLineItem={makeLineItem()}
        onClose={onClose}
        onSave={onSave}
        onRequestDelete={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "   " } });
    await user.click(screen.getByTestId("line-item-edit-sheet-overlay"));

    expect(screen.getByRole("alert")).toHaveTextContent("Description is required.");
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("blocks dismiss with a validation error when price is invalid", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <LineItemEditSheet
        open
        mode="edit"
        initialLineItem={makeLineItem()}
        onClose={onClose}
        onSave={onSave}
        onRequestDelete={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: "12x" } });
    await user.click(screen.getByTestId("line-item-edit-sheet-overlay"));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid number for price.");
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("autosaves trimmed values on valid dismiss", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <LineItemEditSheet
        open
        mode="edit"
        initialLineItem={makeLineItem()}
        onClose={onClose}
        onSave={onSave}
        onRequestDelete={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: " Premium mulch " } });
    fireEvent.change(screen.getByLabelText(/details/i), { target: { value: " 6 yards " } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: " " } });
    await user.click(screen.getByTestId("line-item-edit-sheet-overlay"));

    expect(onSave).toHaveBeenCalledWith({
      description: "Premium mulch",
      details: "6 yards",
      price: null,
      flagged: true,
      flagReason: "Needs review",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps decimal input mode and 2-row details field", () => {
    render(
      <LineItemEditSheet
        open
        mode="edit"
        initialLineItem={makeLineItem()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/price/i)).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByLabelText(/details/i)).toHaveAttribute("rows", "2");
  });

  it("fires delete callback from top-right trash action", () => {
    const onRequestDelete = vi.fn();

    render(
      <LineItemEditSheet
        open
        mode="edit"
        initialLineItem={makeLineItem()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onRequestDelete={onRequestDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /delete line item/i }));
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
  });

  it("saves to catalog using normalized manual values", async () => {
    const user = userEvent.setup();
    const onSaveToCatalog = vi.fn().mockResolvedValue(undefined);

    render(
      <LineItemEditSheet
        open
        mode="edit"
        initialLineItem={makeLineItem()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onSaveToCatalog={onSaveToCatalog}
        onRequestDelete={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "  Garden edging  " } });
    fireEvent.change(screen.getByLabelText(/details/i), { target: { value: "  Around driveway  " } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: "95.5" } });

    await user.click(screen.getByRole("button", { name: /save to catalog/i }));

    await waitFor(() => {
      expect(onSaveToCatalog).toHaveBeenCalledWith({
        title: "Garden edging",
        details: "Around driveway",
        defaultPrice: 95.5,
      });
    });
  });

  it("loads catalog tab lazily and inserts a catalog item into the add flow", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi.fn();
    const onLoadCatalogItems = vi.fn().mockResolvedValue([
      {
        id: "catalog-1",
        title: "Spring Cleanup",
        details: "Blow out beds",
        defaultPrice: 180,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
      },
    ]);

    render(
      <LineItemEditSheet
        open
        mode="add"
        initialLineItem={makeLineItem({ description: "", details: null, price: null })}
        onClose={onClose}
        onSave={onSave}
        onSaveToCatalog={vi.fn().mockResolvedValue(undefined)}
        onLoadCatalogItems={onLoadCatalogItems}
      />,
    );

    expect(onLoadCatalogItems).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: /catalog/i }));
    await waitFor(() => {
      expect(onLoadCatalogItems).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Spring Cleanup")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /insert/i }));

    expect(onSave).toHaveBeenCalledWith({
      description: "Spring Cleanup",
      details: "Blow out beds",
      price: 180,
      flagged: false,
      flagReason: null,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
