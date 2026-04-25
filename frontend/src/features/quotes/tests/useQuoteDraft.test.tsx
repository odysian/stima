import "fake-indexeddb/auto";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useQuoteDraft, type QuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import * as draftRepositoryModule from "@/features/quotes/offline/draftRepository";
import {
  buildCaptureHandoffDraftKey,
  CAPTURE_HANDOFF_DOCUMENT_ID,
  getLocalDraft,
  saveLocalDraft,
} from "@/features/quotes/offline/draftRepository";
import { resetCaptureDbForTests } from "@/features/quotes/offline/captureDb";

const DRAFT_STORAGE_KEY = "stima_quote_draft";
const TEST_USER_ID = "user-a";

const draftFixture: QuoteDraft = {
  customerId: "cust-1",
  launchOrigin: "/",
  title: "Front Yard Refresh",
  transcript: "5 yards brown mulch",
  lineItems: [
    {
      description: "Brown mulch",
      details: "5 yards",
      price: 120,
      flagged: true,
      flagReason: "Unit phrasing may be ambiguous",
    },
  ],
  total: 120,
  taxRate: null,
  discountType: null,
  discountValue: null,
  depositAmount: null,
  notes: "Thanks for your business",
  sourceType: "text",
};

function HookHarness({ userId = TEST_USER_ID }: { userId?: string }): React.ReactElement {
  const { draft, isLoading, setDraft, updateLineItem, removeLineItem, clearDraft } = useQuoteDraft(userId);

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
      <output data-testid="draft-loading">{isLoading ? "loading" : "ready"}</output>
      <output data-testid="draft-state">{draft ? JSON.stringify(draft) : "null"}</output>
    </div>
  );
}

async function readPersistedDraft(userId = TEST_USER_ID): Promise<QuoteDraft | null> {
  const record = await getLocalDraft<QuoteDraft>(buildCaptureHandoffDraftKey(userId), userId);
  return record?.payload ?? null;
}

beforeEach(async () => {
  window.sessionStorage.clear();
  await resetCaptureDbForTests();
});

afterEach(async () => {
  window.sessionStorage.clear();
  await resetCaptureDbForTests();
});

describe("useQuoteDraft", () => {
  it("hydrates from sessionStorage once, migrates to IndexedDB, and clears the legacy key", async () => {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftFixture));

    render(<HookHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("draft-loading")).toHaveTextContent("ready");
      expect(screen.getByTestId("draft-state")).toHaveTextContent(JSON.stringify(draftFixture));
    });
    expect(window.sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    await expect(readPersistedDraft()).resolves.toEqual(draftFixture);
  });

  it("writes draft to IndexedDB when setDraft is called", async () => {
    render(<HookHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("draft-loading")).toHaveTextContent("ready");
    });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Set Draft" }));
    });

    await waitFor(async () => {
      await expect(readPersistedDraft()).resolves.toEqual(draftFixture);
    });
  });

  it("supports functional draft updates against the latest state", async () => {
    function FunctionalHarness(): React.ReactElement {
      const { draft, isLoading, setDraft } = useQuoteDraft(TEST_USER_ID);

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
          <output data-testid="functional-loading">{isLoading ? "loading" : "ready"}</output>
          <output data-testid="functional-draft-state">{draft ? JSON.stringify(draft) : "null"}</output>
        </div>
      );
    }

    render(<FunctionalHarness />);
    await waitFor(() => {
      expect(screen.getByTestId("functional-loading")).toHaveTextContent("ready");
    });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Seed Draft" }));
      fireEvent.click(screen.getByRole("button", { name: "Clear Discount" }));
    });

    expect(screen.getByTestId("functional-draft-state")).toHaveTextContent(
      JSON.stringify({
        ...draftFixture,
        discountType: null,
        discountValue: null,
      }),
    );
  });

  it("removes draft from state and IndexedDB when clearDraft is called", async () => {
    render(<HookHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("draft-loading")).toHaveTextContent("ready");
    });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Set Draft" }));
      fireEvent.click(screen.getByRole("button", { name: "Clear Draft" }));
    });

    expect(screen.getByTestId("draft-state")).toHaveTextContent("null");
    await expect(readPersistedDraft()).resolves.toBeNull();
  });

  it("rehydrates older drafts from migration payloads without flag metadata", async () => {
    const legacyDraft = {
      customerId: draftFixture.customerId,
      transcript: draftFixture.transcript,
      lineItems: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
      total: draftFixture.total,
      notes: draftFixture.notes,
      sourceType: draftFixture.sourceType,
    };
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(legacyDraft));

    render(<HookHarness />);

    const expectedDraft = {
      ...draftFixture,
      title: "",
      launchOrigin: "/",
      lineItems: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
    };
    await waitFor(() => {
      expect(screen.getByTestId("draft-state")).toHaveTextContent(JSON.stringify(expectedDraft));
    });
    await expect(readPersistedDraft()).resolves.toEqual(expectedDraft);
  });

  it("updates one line item and persists it to IndexedDB", async () => {
    render(<HookHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("draft-loading")).toHaveTextContent("ready");
    });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Set Draft" }));
      fireEvent.click(screen.getByRole("button", { name: "Update Line Item" }));
    });

    const expectedDraft = {
      ...draftFixture,
      lineItems: [{ description: "Updated mulch", details: "6 yards", price: 150 }],
    };
    await waitFor(async () => {
      await expect(readPersistedDraft()).resolves.toEqual(expectedDraft);
    });
  });

  it("removes one line item and persists it to IndexedDB", async () => {
    render(<HookHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("draft-loading")).toHaveTextContent("ready");
    });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Set Draft" }));
      fireEvent.click(screen.getByRole("button", { name: "Remove Line Item" }));
    });

    const expectedDraft = {
      ...draftFixture,
      lineItems: [],
    };
    await waitFor(async () => {
      await expect(readPersistedDraft()).resolves.toEqual(expectedDraft);
    });
  });

  it("returns null when a draft exists for a different user", async () => {
    await saveLocalDraft({
      draftKey: buildCaptureHandoffDraftKey("user-a"),
      userId: "user-a",
      docType: "capture_handoff",
      documentId: CAPTURE_HANDOFF_DOCUMENT_ID,
      payload: draftFixture,
    });

    render(<HookHarness userId="user-b" />);

    await waitFor(() => {
      expect(screen.getByTestId("draft-loading")).toHaveTextContent("ready");
      expect(screen.getByTestId("draft-state")).toHaveTextContent("null");
    });
  });

  it("cancels pending persist when user changes before debounce fires", async () => {
    const persistSpy = vi.spyOn(draftRepositoryModule, "saveLocalDraft").mockResolvedValue(undefined);
    try {
      const { rerender } = render(<HookHarness userId="user-a" />);
      await waitFor(() => {
        expect(screen.getByTestId("draft-loading")).toHaveTextContent("ready");
      });

      vi.useFakeTimers();
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Set Draft" }));
      });
      rerender(<HookHarness userId="user-b" />);

      await act(async () => {
        vi.advanceTimersByTime(200);
        await Promise.resolve();
      });

      expect(persistSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      persistSpy.mockRestore();
    }
  });
});
