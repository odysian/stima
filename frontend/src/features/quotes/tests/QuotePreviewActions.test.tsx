import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuotePreviewActions } from "@/features/quotes/components/QuotePreviewActions";

type ActionState = "draft" | "ready" | "shared" | "viewed" | "approved" | "declined";

function makeProps(overrides: Partial<ComponentProps<typeof QuotePreviewActions>> = {}) {
  return {
    actionState: "draft" as ActionState,
    emailActionLabel: null,
    hasCustomerEmail: true,
    onGeneratePdf: vi.fn().mockResolvedValue(undefined),
    onSendEmail: vi.fn().mockResolvedValue(undefined),
    onCopyLink: vi.fn().mockResolvedValue(undefined),
    openPdfUrl: "blob:quote-preview",
    shareUrl: "http://localhost:3000/doc/share-token-1",
    isGeneratingPdf: false,
    isSendingEmail: false,
    isCopyingLink: false,
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
    expect(screen.queryByRole("button", { name: /send by email/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copy link/i })).not.toBeInTheDocument();
  });

  it("renders send by email, copy link, and open pdf for ready quotes", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
          actionState: "ready",
          emailActionLabel: "Send by Email",
          openPdfUrl: null,
          shareUrl: null,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: /send by email/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open pdf/i })).toBeInTheDocument();
  });

  it("renders resend email, copy link, and open pdf for shared quotes", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
          actionState: "shared",
          emailActionLabel: "Resend Email",
        })}
      />,
    );

    expect(screen.getByRole("button", { name: /resend email/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open pdf/i })).toHaveAttribute(
      "href",
      "blob:quote-preview",
    );
  });

  it.each(["approved", "declined"] as const)(
    "renders copy link and open pdf without email for %s quotes",
    (actionState) => {
      render(<QuotePreviewActions {...makeProps({ actionState })} />);

      expect(screen.queryByRole("button", { name: /send by email/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /resend email/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /open pdf/i })).toBeInTheDocument();
    },
  );

  it("disables the email action and shows help text when customer email is missing", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
          actionState: "ready",
          emailActionLabel: "Send by Email",
          hasCustomerEmail: false,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: /send by email/i })).toBeDisabled();
    expect(screen.getByText(/add a customer email/i)).toBeInTheDocument();
  });

  it("disables the email action while quote outcome mutation is pending", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
          actionState: "shared",
          emailActionLabel: "Resend Email",
          isMarkingWon: true,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: /resend email/i })).toBeDisabled();
  });

  it("shows in-flight resend state copy", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
          actionState: "shared",
          emailActionLabel: "Resend Email",
          isSendingEmail: true,
        })}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Sending quote email...");
  });

  it("calls copy-link handler when copy link is pressed", () => {
    const onCopyLink = vi.fn().mockResolvedValue(undefined);
    render(
      <QuotePreviewActions
        {...makeProps({
          actionState: "shared",
          emailActionLabel: "Resend Email",
          onCopyLink,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    expect(onCopyLink).toHaveBeenCalledTimes(1);
  });
});
