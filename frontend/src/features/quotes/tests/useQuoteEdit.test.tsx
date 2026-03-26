import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useQuoteEdit, type QuoteEditDraft } from "@/features/quotes/hooks/useQuoteEdit";

const EDIT_STORAGE_KEY = "stima_quote_edit";

const draftFixture: QuoteEditDraft = {
  quoteId: "quote-1",
  title: "Front Yard Refresh",
  lineItems: [
    {
      description: "Brown mulch",
      details: "5 yards",
      price: 120,
    },
  ],
  total: 120,
  notes: "Thanks for your business",
};

function HookHarness(): React.ReactElement {
  const { draft, setDraft, updateLineItem, removeLineItem, clearDraft } = useQuoteEdit();

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

describe("useQuoteEdit", () => {
  it("rehydrates edit state from sessionStorage on mount", () => {
    window.sessionStorage.setItem(EDIT_STORAGE_KEY, JSON.stringify(draftFixture));

    render(<HookHarness />);

    expect(screen.getByTestId("draft-state")).toHaveTextContent(JSON.stringify(draftFixture));
  });

  it("writes draft to sessionStorage synchronously when setDraft is called", () => {
    render(<HookHarness />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Set Draft" }));

      const rawStoredDraft = window.sessionStorage.getItem(EDIT_STORAGE_KEY);
      expect(rawStoredDraft).not.toBeNull();
      expect(JSON.parse(rawStoredDraft ?? "")).toEqual(draftFixture);
    });
  });

  it("rejects corrupted stored line items during rehydration", () => {
    window.sessionStorage.setItem(
      EDIT_STORAGE_KEY,
      JSON.stringify({
        ...draftFixture,
        lineItems: [{ details: "Missing description", price: 120 }],
      }),
    );

    render(<HookHarness />);

    expect(screen.getByTestId("draft-state")).toHaveTextContent("null");
  });

  it("updates one line item and persists it to sessionStorage", () => {
    render(<HookHarness />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Set Draft" }));
      fireEvent.click(screen.getByRole("button", { name: "Update Line Item" }));
    });

    expect(screen.getByTestId("draft-state")).toHaveTextContent(
      JSON.stringify({
        ...draftFixture,
        lineItems: [{ description: "Updated mulch", details: "6 yards", price: 150 }],
      }),
    );
    expect(JSON.parse(window.sessionStorage.getItem(EDIT_STORAGE_KEY) ?? "")).toEqual({
      ...draftFixture,
      lineItems: [{ description: "Updated mulch", details: "6 yards", price: 150 }],
    });
  });

  it("removes draft from state and storage when clearDraft is called", () => {
    render(<HookHarness />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Set Draft" }));
      fireEvent.click(screen.getByRole("button", { name: "Clear Draft" }));
    });

    expect(screen.getByTestId("draft-state")).toHaveTextContent("null");
    expect(window.sessionStorage.getItem(EDIT_STORAGE_KEY)).toBeNull();
  });

  it("removes one line item and persists it to sessionStorage", () => {
    render(<HookHarness />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Set Draft" }));
      fireEvent.click(screen.getByRole("button", { name: "Remove Line Item" }));
    });

    expect(screen.getByTestId("draft-state")).toHaveTextContent(
      JSON.stringify({
        ...draftFixture,
        lineItems: [],
      }),
    );
    expect(JSON.parse(window.sessionStorage.getItem(EDIT_STORAGE_KEY) ?? "")).toEqual({
      ...draftFixture,
      lineItems: [],
    });
  });
});
