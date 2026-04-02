import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuotePreviewActions } from "@/features/quotes/components/QuotePreviewActions";

function makeProps(overrides: Partial<ComponentProps<typeof QuotePreviewActions>> = {}) {
  return {
    emailActionLabel: "Send by Email",
    hasCustomerEmail: true,
    onGeneratePdf: vi.fn().mockResolvedValue(undefined),
    onRequestSendEmail: vi.fn(),
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
  it("renders a primary send action with compact quote utilities for draft quotes", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
          openPdfUrl: null,
          shareUrl: null,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: /send by email/i })).toBeInTheDocument();
    const utilities = screen.getByRole("group", { name: /quote utilities/i });
    expect(within(utilities).getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    expect(within(utilities).getByRole("button", { name: /open pdf/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate pdf/i })).not.toBeInTheDocument();
  });

  it("renders send by email, copy link, and open pdf for ready quotes", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
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

  it("renders resend email, copy link, and open pdf for closed quotes", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
          emailActionLabel: "Resend Email",
        })}
      />,
    );

    expect(screen.getByRole("button", { name: /resend email/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open pdf/i })).toBeInTheDocument();
  });

  it("disables the email action and shows help text when customer email is missing", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
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
          emailActionLabel: "Resend Email",
          isMarkingWon: true,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: /resend email/i })).toBeDisabled();
  });

  it("disables copy link while other quote mutations are pending", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
          emailActionLabel: "Resend Email",
          isMarkingLost: true,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: /copy link/i })).toBeDisabled();
  });

  it("shows in-flight resend state copy", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
          emailActionLabel: "Resend Email",
          isSendingEmail: true,
        })}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Sending quote email...");
  });

  it("calls the request-send-email handler when the primary action is pressed", () => {
    const onRequestSendEmail = vi.fn();
    render(
      <QuotePreviewActions
        {...makeProps({
          onRequestSendEmail,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /send by email/i }));

    expect(onRequestSendEmail).toHaveBeenCalledTimes(1);
  });

  it("calls copy-link handler when copy link is pressed", () => {
    const onCopyLink = vi.fn().mockResolvedValue(undefined);
    render(
      <QuotePreviewActions
        {...makeProps({
          emailActionLabel: "Resend Email",
          onCopyLink,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    expect(onCopyLink).toHaveBeenCalledTimes(1);
  });
});
