import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuotePreviewActions } from "@/features/quotes/components/QuotePreviewActions";

type ActionState = "draft" | "ready" | "shared" | "viewed" | "approved" | "declined";

function makeProps(overrides: Partial<ComponentProps<typeof QuotePreviewActions>> = {}) {
  return {
    actionState: "draft" as ActionState,
    onGeneratePdf: vi.fn().mockResolvedValue(undefined),
    onShare: vi.fn().mockResolvedValue(undefined),
    openPdfUrl: "blob:quote-preview",
    shareUrl: "http://localhost:3000/share/share-token-1",
    isGeneratingPdf: false,
    isSharing: false,
    isMarkingWon: false,
    isMarkingLost: false,
    disabled: false,
    pdfError: null,
    shareError: null,
    outcomeError: null,
    shareMessage: null,
    ...overrides,
  };
}

describe("QuotePreviewActions", () => {
  it("renders the draft generate-pdf action", () => {
    render(<QuotePreviewActions {...makeProps()} />);

    expect(screen.getByRole("button", { name: /generate pdf/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /share quote/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open pdf/i })).not.toBeInTheDocument();
  });

  it("renders share as the only primary action for ready quotes", () => {
    render(<QuotePreviewActions {...makeProps({ actionState: "ready" })} />);

    expect(screen.getByRole("button", { name: /share quote/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open pdf/i })).not.toBeInTheDocument();
  });

  it.each(["shared", "viewed", "approved", "declined"] as const)(
    "renders open pdf as the primary action for %s quotes",
    (actionState) => {
      render(<QuotePreviewActions {...makeProps({ actionState })} />);

      expect(screen.getByRole("link", { name: /open pdf/i })).toHaveAttribute(
        "href",
        "blob:quote-preview",
      );
      expect(screen.queryByRole("button", { name: /share quote/i })).not.toBeInTheDocument();
    },
  );

  it("falls back to the shared PDF link when a closed quote has no local blob URL", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
          actionState: "approved",
          openPdfUrl: null,
        })}
      />,
    );

    expect(screen.getByRole("link", { name: /open pdf/i })).toHaveAttribute(
      "href",
      "http://localhost:3000/share/share-token-1",
    );
  });

  it("shows in-flight won state copy", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
          actionState: "shared",
          isMarkingWon: true,
        })}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Recording quote as won...");
    expect(screen.getByRole("link", { name: /open pdf/i })).toBeInTheDocument();
  });
});
