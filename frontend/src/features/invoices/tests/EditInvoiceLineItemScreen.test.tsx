import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditInvoiceLineItemScreen } from "@/features/invoices/components/EditInvoiceLineItemScreen";
import { useInvoiceEdit, type InvoiceEditDraft } from "@/features/invoices/hooks/useInvoiceEdit";
import { HOME_ROUTE } from "@/features/quotes/utils/workflowNavigation";

const navigateMock = vi.fn();
const updateLineItemMock = vi.fn();
const removeLineItemMock = vi.fn();
const useParamsMock = vi.fn(() => ({ id: "invoice-1", lineItemIndex: "0" }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => useParamsMock(),
  };
});

vi.mock("@/features/invoices/hooks/useInvoiceEdit", () => ({
  useInvoiceEdit: vi.fn(),
}));

const mockedUseInvoiceEdit = vi.mocked(useInvoiceEdit);

function makeDraft(overrides: Partial<InvoiceEditDraft> = {}): InvoiceEditDraft {
  return {
    invoiceId: "invoice-1",
    title: "",
    lineItems: [
      {
        description: "Brown mulch",
        details: "5 yards",
        price: 120,
      },
    ],
    total: 120,
    taxRate: null,
    discountType: null,
    discountValue: null,
    depositAmount: null,
    notes: "",
    dueDate: "2026-04-19",
    ...overrides,
  };
}

function renderScreen(draft: InvoiceEditDraft | null): void {
  mockedUseInvoiceEdit.mockReturnValue({
    draft,
    setDraft: vi.fn(),
    updateLineItem: updateLineItemMock,
    removeLineItem: removeLineItemMock,
    clearDraft: vi.fn(),
  });

  render(
    <MemoryRouter>
      <EditInvoiceLineItemScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useParamsMock.mockReturnValue({ id: "invoice-1", lineItemIndex: "0" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("EditInvoiceLineItemScreen", () => {
  it("loads the line item by index", () => {
    renderScreen(makeDraft());

    expect(screen.getByLabelText(/description/i)).toHaveValue("Brown mulch");
    expect(screen.getByLabelText(/details/i)).toHaveValue("5 yards");
    expect(screen.getByLabelText(/price/i)).toHaveValue("120");
  });

  it("saves changes and navigates back to the invoice edit screen", () => {
    renderScreen(makeDraft());

    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Premium mulch" },
    });
    fireEvent.change(screen.getByLabelText(/details/i), {
      target: { value: "6 yards" },
    });
    fireEvent.change(screen.getByLabelText(/price/i), {
      target: { value: "140" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(updateLineItemMock).toHaveBeenCalledWith(0, {
      description: "Premium mulch",
      details: "6 yards",
      price: 140,
    });
    expect(navigateMock).toHaveBeenCalledWith("/invoices/invoice-1/edit", { replace: true });
  });

  it("deletes item and navigates back to the invoice edit screen", () => {
    renderScreen(makeDraft());

    fireEvent.click(screen.getByRole("button", { name: /delete line item/i }));

    expect(removeLineItemMock).toHaveBeenCalledWith(0);
    expect(navigateMock).toHaveBeenCalledWith("/invoices/invoice-1/edit", { replace: true });
  });

  it("exits home from the workflow header", () => {
    renderScreen(makeDraft());

    fireEvent.click(screen.getByRole("button", { name: /exit to home/i }));

    expect(navigateMock).toHaveBeenCalledWith(HOME_ROUTE, { replace: true });
  });
});
