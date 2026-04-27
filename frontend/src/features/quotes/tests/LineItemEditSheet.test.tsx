import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LineItemEditSheet } from "@/features/quotes/components/LineItemEditSheet";
import type { LineItemCatalogItem } from "@/features/line-item-catalog/types/lineItemCatalog.types";
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

function makeCatalogItem(overrides: Partial<LineItemCatalogItem> = {}): LineItemCatalogItem {
  return {
    id: "catalog-1",
    title: "Brown mulch",
    details: "5 yards",
    defaultPrice: 120,
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
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

  it("shows spoken-money review explanation for flagged edit items", () => {
    render(
      <LineItemEditSheet
        open
        mode="edit"
        initialLineItem={makeLineItem({ flagReason: "spoken_money_correction" })}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Review needed")).toBeInTheDocument();
    expect(
      screen.getByText("Voice capture may have interpreted cents as dollars. Confirm the amount and update the price if needed."),
    ).toBeInTheDocument();
  });

  it("does not show review explanation for unflagged items", () => {
    render(
      <LineItemEditSheet
        open
        mode="edit"
        initialLineItem={makeLineItem({ flagged: false, flagReason: null })}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.queryByText("Review needed")).not.toBeInTheDocument();
  });

  it("dismisses the review banner and clears flag fields on save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <LineItemEditSheet
        open
        mode="edit"
        initialLineItem={makeLineItem({ flagReason: "spoken_money_correction" })}
        onClose={onClose}
        onSave={onSave}
        onRequestDelete={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/details/i), { target: { value: " 6 yards " } });
    await user.click(screen.getByRole("button", { name: /^dismiss$/i }));
    await user.click(screen.getByTestId("line-item-edit-sheet-overlay"));

    expect(onSave).toHaveBeenCalledWith({
      description: "Brown mulch",
      details: "6 yards",
      price: 120,
      flagged: false,
      flagReason: null,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Review needed")).not.toBeInTheDocument();
  });

  it("keeps a dismissed review state after validation errors until save succeeds", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <LineItemEditSheet
        open
        mode="edit"
        initialLineItem={makeLineItem({ flagReason: "spoken_money_correction" })}
        onClose={onClose}
        onSave={onSave}
        onRequestDelete={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^dismiss$/i }));
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "   " } });
    await user.click(screen.getByTestId("line-item-edit-sheet-overlay"));

    expect(screen.getByRole("alert")).toHaveTextContent("Description is required.");
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "Brown mulch" } });
    await user.click(screen.getByTestId("line-item-edit-sheet-overlay"));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      flagged: false,
      flagReason: null,
    }));
    expect(onClose).toHaveBeenCalledTimes(1);
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

  it("add mode dismisses on backdrop tap with empty fields without validation", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <LineItemEditSheet
        open
        mode="add"
        initialLineItem={makeLineItem({ description: "", details: null, price: null })}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByTestId("line-item-edit-sheet-overlay"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("add mode dismisses on backdrop tap with partial fields without validation", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <LineItemEditSheet
        open
        mode="add"
        initialLineItem={makeLineItem({ description: "", details: null, price: null })}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "Mulch refresh" } });
    await user.click(screen.getByTestId("line-item-edit-sheet-overlay"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("add mode add button validates blank description", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <LineItemEditSheet
        open
        mode="add"
        initialLineItem={makeLineItem({ description: "", details: null, price: null })}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add line item/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Description is required.");
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("add mode add button saves valid manual fields and closes", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <LineItemEditSheet
        open
        mode="add"
        initialLineItem={makeLineItem({ description: "", details: null, price: null })}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "  Fresh mulch  " } });
    fireEvent.change(screen.getByLabelText(/details/i), { target: { value: "  Front beds  " } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: "95.5" } });

    await user.click(screen.getByRole("button", { name: /add line item/i }));

    expect(onSave).toHaveBeenCalledWith({
      description: "Fresh mulch",
      details: "Front beds",
      price: 95.5,
      flagged: true,
      flagReason: "Needs review",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("edit mode backdrop dismiss still validates blank description", async () => {
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
    expect(screen.getByLabelText(/details/i)).toHaveClass("resize-none");
  });

  it("keeps a shared minimum tabpanel height in add mode across Manual and Catalog", async () => {
    const user = userEvent.setup();
    const onLoadCatalogItems = vi.fn().mockResolvedValue([]);

    render(
      <LineItemEditSheet
        open
        mode="add"
        initialLineItem={makeLineItem({ description: "", details: null, price: null })}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onLoadCatalogItems={onLoadCatalogItems}
      />,
    );

    expect(screen.getByRole("tabpanel")).toHaveClass("min-h-80");

    await user.click(screen.getByRole("tab", { name: /catalog/i }));
    await waitFor(() => {
      expect(onLoadCatalogItems).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("tabpanel")).toHaveClass("min-h-80");
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

  it("successful save shows filled bookmark icon and item in catalog tab list in same open", async () => {
    const user = userEvent.setup();
    const onSaveToCatalog = vi.fn().mockResolvedValue(
      makeCatalogItem({
        title: "Garden edging",
        details: "Around driveway",
        defaultPrice: 95.5,
      }),
    );
    const onLoadCatalogItems = vi.fn().mockResolvedValue([]);

    render(
      <LineItemEditSheet
        open
        mode="add"
        initialLineItem={makeLineItem()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onSaveToCatalog={onSaveToCatalog}
        onLoadCatalogItems={onLoadCatalogItems}
      />,
    );

    const bookmarkButton = screen.getByRole("button", { name: /save to catalog/i });
    expect(bookmarkButton.querySelector("svg.lucide-bookmark-plus")).toBeInTheDocument();
    expect(within(bookmarkButton).queryByText(/^save$/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "  Garden edging  " } });
    fireEvent.change(screen.getByLabelText(/details/i), { target: { value: "  Around driveway  " } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: "95.5" } });

    await user.click(bookmarkButton);

    await waitFor(() => {
      expect(onSaveToCatalog).toHaveBeenCalledWith({
        title: "Garden edging",
        details: "Around driveway",
        defaultPrice: 95.5,
      });
    });
    expect(bookmarkButton.querySelector("svg.lucide-bookmark")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /catalog/i }));
    await waitFor(() => {
      expect(onLoadCatalogItems).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Garden edging")).toBeInTheDocument();
  });

  it("clicking filled bookmark deletes saved item and resets icon/list state", async () => {
    const user = userEvent.setup();
    const createdItem = makeCatalogItem({
      id: "catalog-9",
      title: "Garden edging",
      details: "Around driveway",
      defaultPrice: 95.5,
    });
    const onSaveToCatalog = vi.fn().mockResolvedValue(createdItem);
    const onDeleteFromCatalog = vi.fn().mockResolvedValue(undefined);
    const onLoadCatalogItems = vi.fn().mockResolvedValue([]);

    render(
      <LineItemEditSheet
        open
        mode="add"
        initialLineItem={makeLineItem()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onSaveToCatalog={onSaveToCatalog}
        onDeleteFromCatalog={onDeleteFromCatalog}
        onLoadCatalogItems={onLoadCatalogItems}
      />,
    );

    const bookmarkButton = screen.getByRole("button", { name: /save to catalog/i });
    await user.click(bookmarkButton);
    await waitFor(() => {
      expect(onSaveToCatalog).toHaveBeenCalledTimes(1);
    });
    expect(bookmarkButton.querySelector("svg.lucide-bookmark")).toBeInTheDocument();

    await user.click(bookmarkButton);
    await waitFor(() => {
      expect(onDeleteFromCatalog).toHaveBeenCalledWith("catalog-9");
    });
    expect(bookmarkButton.querySelector("svg.lucide-bookmark-plus")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /catalog/i }));
    await waitFor(() => {
      expect(onLoadCatalogItems).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("Garden edging")).not.toBeInTheDocument();
  });

  it("editing a field after save resets bookmark icon without deleting", async () => {
    const user = userEvent.setup();
    const onSaveToCatalog = vi.fn().mockResolvedValue(
      makeCatalogItem({ id: "catalog-2", title: "Garden edging", defaultPrice: 95.5 }),
    );
    const onDeleteFromCatalog = vi.fn().mockResolvedValue(undefined);

    render(
      <LineItemEditSheet
        open
        mode="edit"
        initialLineItem={makeLineItem()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onSaveToCatalog={onSaveToCatalog}
        onDeleteFromCatalog={onDeleteFromCatalog}
        onRequestDelete={vi.fn()}
      />,
    );

    const bookmarkButton = screen.getByRole("button", { name: /save to catalog/i });
    await user.click(bookmarkButton);
    await waitFor(() => {
      expect(onSaveToCatalog).toHaveBeenCalledTimes(1);
    });
    expect(bookmarkButton.querySelector("svg.lucide-bookmark")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "Updated description" } });

    expect(bookmarkButton.querySelector("svg.lucide-bookmark-plus")).toBeInTheDocument();
    expect(onDeleteFromCatalog).not.toHaveBeenCalled();
  });

  it("shows a sheet-level error when save-to-catalog fails", async () => {
    const user = userEvent.setup();
    const onSaveToCatalog = vi.fn().mockRejectedValue(new Error("Unable to save line item to catalog"));

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

    await user.click(screen.getByRole("button", { name: /save to catalog/i }));

    await waitFor(() => {
      expect(onSaveToCatalog).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to save line item to catalog");
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
        onSaveToCatalog={vi.fn().mockResolvedValue(makeCatalogItem())}
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

  it("hides save-to-catalog bookmark button on catalog tab", async () => {
    const user = userEvent.setup();

    render(
      <LineItemEditSheet
        open
        mode="add"
        initialLineItem={makeLineItem({ description: "", details: null, price: null })}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onSaveToCatalog={vi.fn().mockResolvedValue(makeCatalogItem())}
        onLoadCatalogItems={vi.fn().mockResolvedValue([])}
      />,
    );

    expect(screen.getByRole("button", { name: /save to catalog/i })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /catalog/i }));

    expect(screen.queryByRole("button", { name: /save to catalog/i })).not.toBeInTheDocument();
  });
});
