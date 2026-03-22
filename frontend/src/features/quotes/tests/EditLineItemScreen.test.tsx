import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditLineItemScreen } from "@/features/quotes/components/EditLineItemScreen";
import { useQuoteDraft, type QuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";

const navigateMock = vi.fn();
const updateLineItemMock = vi.fn();
const removeLineItemMock = vi.fn();
const useParamsMock = vi.fn(() => ({ lineItemIndex: "0" }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => useParamsMock(),
  };
});

vi.mock("@/features/quotes/hooks/useQuoteDraft", () => ({
  useQuoteDraft: vi.fn(),
}));

const mockedUseQuoteDraft = vi.mocked(useQuoteDraft);

function makeDraft(overrides: Partial<QuoteDraft> = {}): QuoteDraft {
  return {
    customerId: "cust-1",
    transcript: "5 yards brown mulch and edge front beds",
    lineItems: [
      {
        description: "Brown mulch",
        details: "5 yards",
        price: 120,
      },
    ],
    total: 120,
    confidenceNotes: [],
    notes: "",
    sourceType: "text",
    ...overrides,
  };
}

function renderScreen(draft: QuoteDraft): void {
  mockedUseQuoteDraft.mockReturnValue({
    draft,
    setDraft: vi.fn(),
    updateLineItem: updateLineItemMock,
    removeLineItem: removeLineItemMock,
    clearDraft: vi.fn(),
  });

  render(
    <MemoryRouter>
      <EditLineItemScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useParamsMock.mockReturnValue({ lineItemIndex: "0" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("EditLineItemScreen", () => {
  it("loads the line item by index", () => {
    renderScreen(makeDraft());

    expect(screen.getByLabelText(/description/i)).toHaveValue("Brown mulch");
    expect(screen.getByLabelText(/details/i)).toHaveValue("5 yards");
    expect(screen.getByLabelText(/price/i)).toHaveValue("120");
  });

  it("saves changes and navigates back to review", () => {
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
    expect(navigateMock).toHaveBeenCalledWith("/quotes/review");
  });

  it("shows error and blocks save when description is empty", () => {
    renderScreen(makeDraft());

    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Description is required.");
    expect(updateLineItemMock).not.toHaveBeenCalled();
  });

  it("shows error and blocks save when price is invalid", () => {
    renderScreen(makeDraft());

    fireEvent.change(screen.getByLabelText(/price/i), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid number for price.");
    expect(updateLineItemMock).not.toHaveBeenCalled();
  });

  it("deletes item and navigates back to review", () => {
    renderScreen(makeDraft());

    fireEvent.click(screen.getByRole("button", { name: /delete line item/i }));

    expect(removeLineItemMock).toHaveBeenCalledWith(0);
    expect(navigateMock).toHaveBeenCalledWith("/quotes/review");
  });

  it("shows AI banner when item is flagged", () => {
    renderScreen(
      makeDraft({
        lineItems: [
          {
            description: "Brown mulch",
            details: "5 yards",
            price: 120,
            flagged: true,
            flagReason: "Unit phrasing may be ambiguous",
          },
        ],
      }),
    );
    expect(screen.getByText(/ai confidence note/i)).toBeInTheDocument();
  });

  it("does not show AI banner when item is not flagged", () => {
    renderScreen(makeDraft());
    expect(screen.queryByText(/ai confidence note/i)).not.toBeInTheDocument();
  });
});
