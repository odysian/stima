import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useQuoteDraft, type QuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";

const DRAFT_STORAGE_KEY = "stima_quote_draft";

const draftFixture: QuoteDraft = {
  customerId: "cust-1",
  transcript: "5 yards brown mulch",
  lineItems: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
  total: 120,
  confidenceNotes: [],
  notes: "Thanks for your business",
};

function HookHarness(): React.ReactElement {
  const { draft, setDraft, clearDraft } = useQuoteDraft();

  return (
    <div>
      <button type="button" onClick={() => setDraft(draftFixture)}>
        Set Draft
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

describe("useQuoteDraft", () => {
  it("rehydrates draft state from sessionStorage on mount", () => {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftFixture));

    render(<HookHarness />);

    expect(screen.getByTestId("draft-state")).toHaveTextContent(JSON.stringify(draftFixture));
  });

  it("writes draft to sessionStorage synchronously when setDraft is called", () => {
    render(<HookHarness />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Set Draft" }));

      const rawStoredDraft = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
      expect(rawStoredDraft).not.toBeNull();
      expect(JSON.parse(rawStoredDraft ?? "")).toEqual(draftFixture);
    });
  });

  it("removes draft from state and storage when clearDraft is called", () => {
    render(<HookHarness />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Set Draft" }));
      fireEvent.click(screen.getByRole("button", { name: "Clear Draft" }));
    });

    expect(screen.getByTestId("draft-state")).toHaveTextContent("null");
    expect(window.sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });
});
