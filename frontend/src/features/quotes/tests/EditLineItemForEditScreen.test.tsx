import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditLineItemForEditScreen } from "@/features/quotes/components/EditLineItemForEditScreen";
import { useQuoteEdit, type QuoteEditDraft } from "@/features/quotes/hooks/useQuoteEdit";

const navigateMock = vi.fn();
const updateLineItemMock = vi.fn();
const removeLineItemMock = vi.fn();
const useParamsMock = vi.fn(() => ({ id: "quote-1", lineItemIndex: "0" }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => useParamsMock(),
  };
});

vi.mock("@/features/quotes/hooks/useQuoteEdit", () => ({
  useQuoteEdit: vi.fn(),
}));

const mockedUseQuoteEdit = vi.mocked(useQuoteEdit);

function makeDraft(overrides: Partial<QuoteEditDraft> = {}): QuoteEditDraft {
  return {
    quoteId: "quote-1",
    lineItems: [
      {
        description: "Brown mulch",
        details: "5 yards",
        price: 120,
      },
    ],
    total: 120,
    notes: "",
    ...overrides,
  };
}

function renderScreen(draft: QuoteEditDraft | null): void {
  mockedUseQuoteEdit.mockReturnValue({
    draft,
    setDraft: vi.fn(),
    updateLineItem: updateLineItemMock,
    removeLineItem: removeLineItemMock,
    clearDraft: vi.fn(),
  });

  render(
    <MemoryRouter>
      <EditLineItemForEditScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useParamsMock.mockReturnValue({ id: "quote-1", lineItemIndex: "0" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("EditLineItemForEditScreen", () => {
  it("loads the line item by index", () => {
    renderScreen(makeDraft());

    expect(screen.getByLabelText(/description/i)).toHaveValue("Brown mulch");
    expect(screen.getByLabelText(/details/i)).toHaveValue("5 yards");
    expect(screen.getByLabelText(/price/i)).toHaveValue("120");
  });

  it("saves changes and navigates back to the quote edit screen", () => {
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
    expect(navigateMock).toHaveBeenCalledWith("/quotes/quote-1/edit");
  });

  it("deletes item and navigates back to the quote edit screen", () => {
    renderScreen(makeDraft());

    fireEvent.click(screen.getByRole("button", { name: /delete line item/i }));

    expect(removeLineItemMock).toHaveBeenCalledWith(0);
    expect(navigateMock).toHaveBeenCalledWith("/quotes/quote-1/edit");
  });
});
