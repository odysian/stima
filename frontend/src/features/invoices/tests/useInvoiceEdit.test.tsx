import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useInvoiceEdit, type InvoiceEditDraft } from "@/features/invoices/hooks/useInvoiceEdit";

const draftFixture: InvoiceEditDraft = {
  invoiceId: "invoice-1",
  title: "Spring Cleanup",
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
  notes: "Thanks for your business",
  dueDate: "2026-04-19",
};

function HookHarness(): React.ReactElement {
  const { draft, setDraft, updateLineItem, removeLineItem, clearDraft } = useInvoiceEdit();

  return (
    <div>
      <button type="button" onClick={() => setDraft(draftFixture)}>
        Set Draft
      </button>
      <button
        type="button"
        onClick={() =>
          updateLineItem(0, {
            description: "Updated mulch",
            details: "6 yards",
            price: 150,
          })
        }
      >
        Update Line Item
      </button>
      <button type="button" onClick={() => removeLineItem(0)}>
        Remove Line Item
      </button>
      <button type="button" onClick={clearDraft}>
        Clear Draft
      </button>
      <output data-testid="draft-state">{draft ? JSON.stringify(draft) : "null"}</output>
    </div>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
});

describe("useInvoiceEdit", () => {
  it("supports functional draft updates", () => {
    function FunctionalHarness(): React.ReactElement {
      const { draft, setDraft } = useInvoiceEdit();

      return (
        <div>
          <button type="button" onClick={() => setDraft(draftFixture)}>
            Seed Draft
          </button>
          <button
            type="button"
            onClick={() =>
              setDraft((currentDraft) => ({
                ...currentDraft,
                discountType: null,
                discountValue: null,
              }))
            }
          >
            Clear Discount
          </button>
          <output data-testid="functional-invoice-state">{draft ? JSON.stringify(draft) : "null"}</output>
        </div>
      );
    }

    render(<FunctionalHarness />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Seed Draft" }));
      fireEvent.click(screen.getByRole("button", { name: "Clear Discount" }));
    });

    expect(screen.getByTestId("functional-invoice-state")).toHaveTextContent(
      JSON.stringify({
        ...draftFixture,
        discountType: null,
        discountValue: null,
      }),
    );
  });

  it("keeps a derived subtotal synced when invoice line items change", () => {
    render(<HookHarness />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Set Draft" }));
      fireEvent.click(screen.getByRole("button", { name: "Update Line Item" }));
    });

    expect(screen.getByTestId("draft-state")).toHaveTextContent(
      JSON.stringify({
        ...draftFixture,
        total: 150,
        lineItems: [{ description: "Updated mulch", details: "6 yards", price: 150 }],
      }),
    );
  });

  it("clears an auto-synced subtotal when the last substantive line item is removed", () => {
    render(<HookHarness />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Set Draft" }));
      fireEvent.click(screen.getByRole("button", { name: "Remove Line Item" }));
    });

    expect(screen.getByTestId("draft-state")).toHaveTextContent(
      JSON.stringify({
        ...draftFixture,
        total: null,
        lineItems: [],
      }),
    );
  });
});
