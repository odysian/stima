import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuotePreviewActions } from "@/features/quotes/components/QuotePreviewActions";

type ActionState = "draft" | "ready" | "shared" | "viewed" | "approved" | "declined";

function makeProps(overrides: Partial<ComponentProps<typeof QuotePreviewActions>> = {}) {
  return {
    actionState: "draft" as ActionState,
    onGeneratePdf: vi.fn().mockResolvedValue(undefined),
    onShare: vi.fn().mockResolvedValue(undefined),
    onCopyShareLink: vi.fn().mockResolvedValue(undefined),
    onMarkWon: vi.fn().mockResolvedValue(undefined),
    onRequestMarkLost: vi.fn(),
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
    expect(screen.queryByRole("button", { name: /mark as won/i })).not.toBeInTheDocument();
  });

  it.each(["shared", "viewed"] as const)(
    "renders share follow-up actions for %s quotes",
    (actionState) => {
      const props = makeProps({ actionState });
      render(<QuotePreviewActions {...props} />);

      fireEvent.click(screen.getByRole("button", { name: /copy share link/i }));
      fireEvent.click(screen.getByRole("button", { name: /mark as won/i }));
      fireEvent.click(screen.getByRole("button", { name: /mark as lost/i }));

      expect(screen.getByRole("link", { name: /open pdf/i })).toHaveAttribute(
        "href",
        "blob:quote-preview",
      );
      expect(props.onCopyShareLink).toHaveBeenCalledTimes(1);
      expect(props.onMarkWon).toHaveBeenCalledTimes(1);
      expect(props.onRequestMarkLost).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("button", { name: /share quote/i })).not.toBeInTheDocument();
    },
  );

  it.each(["approved", "declined"] as const)(
    "renders only the open-pdf action for %s quotes",
    (actionState) => {
      render(<QuotePreviewActions {...makeProps({ actionState })} />);

      expect(screen.getByRole("link", { name: /open pdf/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /copy share link/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /mark as won/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /mark as lost/i })).not.toBeInTheDocument();
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

  it("shows in-flight won state and disables outcome actions", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
          actionState: "shared",
          isMarkingWon: true,
        })}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Recording quote as won...");
    expect(screen.getByRole("button", { name: /loading/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /mark as lost/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /copy share link/i })).toBeDisabled();
  });
});
