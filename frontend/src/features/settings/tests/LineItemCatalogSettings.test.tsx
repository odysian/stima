import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LineItemCatalogSettingsScreen } from "@/features/line-item-catalog/components/LineItemCatalogSettingsScreen";
import { lineItemCatalogService } from "@/features/line-item-catalog/services/lineItemCatalogService";
import { ToastProvider } from "@/ui/Toast";

vi.mock("@/features/line-item-catalog/services/lineItemCatalogService", () => ({
  lineItemCatalogService: {
    listItems: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
  },
}));

const mockedLineItemCatalogService = vi.mocked(lineItemCatalogService);

function renderScreen(): void {
  render(
    <MemoryRouter>
      <ToastProvider>
        <LineItemCatalogSettingsScreen />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedLineItemCatalogService.listItems.mockResolvedValue([
    {
      id: "catalog-1",
      title: "Spring Cleanup",
      details: "Blow out beds",
      defaultPrice: 180,
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    },
  ]);
  mockedLineItemCatalogService.createItem.mockResolvedValue({
    id: "catalog-2",
    title: "Mow and edge",
    details: "Front and back yard",
    defaultPrice: 95,
    createdAt: "2026-04-20T01:00:00.000Z",
    updatedAt: "2026-04-20T01:00:00.000Z",
  });
  mockedLineItemCatalogService.updateItem.mockResolvedValue({
    id: "catalog-2",
    title: "Mow, edge, and bag",
    details: "Front and back yard",
    defaultPrice: 105,
    createdAt: "2026-04-20T01:00:00.000Z",
    updatedAt: "2026-04-20T02:00:00.000Z",
  });
  mockedLineItemCatalogService.deleteItem.mockResolvedValue(undefined);
});

describe("LineItemCatalogSettingsScreen", () => {
  it("validates title and supports create/edit/delete management", async () => {
    renderScreen();

    expect(await screen.findByText("Spring Cleanup")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /create item/i }));
    expect(screen.getByRole("alert")).toHaveTextContent("Title is required.");
    expect(mockedLineItemCatalogService.createItem).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^title$/i), {
      target: { value: "Mow and edge" },
    });
    fireEvent.change(screen.getByLabelText(/details/i), {
      target: { value: "Front and back yard" },
    });
    fireEvent.change(screen.getByLabelText(/default price/i), {
      target: { value: "95" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create item/i }));

    await waitFor(() => {
      expect(mockedLineItemCatalogService.createItem).toHaveBeenCalledWith({
        title: "Mow and edge",
        details: "Front and back yard",
        defaultPrice: 95,
      });
    });
    expect(await screen.findByText("Mow and edge")).toBeInTheDocument();

    const createdItemCard = screen.getByText("Mow and edge").closest("article");
    expect(createdItemCard).not.toBeNull();
    fireEvent.click(within(createdItemCard as HTMLElement).getByRole("button", { name: /edit/i }));

    fireEvent.change(screen.getByLabelText(/^title$/i), {
      target: { value: "Mow, edge, and bag" },
    });
    fireEvent.change(screen.getByLabelText(/default price/i), {
      target: { value: "105" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update item/i }));

    await waitFor(() => {
      expect(mockedLineItemCatalogService.updateItem).toHaveBeenCalledWith("catalog-2", {
        title: "Mow, edge, and bag",
        details: "Front and back yard",
        defaultPrice: 105,
      });
    });

    const updatedCard = await screen.findByText("Mow, edge, and bag");
    expect(updatedCard).toBeInTheDocument();

    const updatedItemCard = updatedCard.closest("article");
    expect(updatedItemCard).not.toBeNull();
    fireEvent.click(within(updatedItemCard as HTMLElement).getByRole("button", { name: /delete/i }));

    const deleteDialog = screen.getByRole("dialog", { name: /delete catalog item/i });
    fireEvent.click(within(deleteDialog).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(mockedLineItemCatalogService.deleteItem).toHaveBeenCalledWith("catalog-2");
    });
    expect(screen.queryByText("Mow, edge, and bag")).not.toBeInTheDocument();
  });
});
