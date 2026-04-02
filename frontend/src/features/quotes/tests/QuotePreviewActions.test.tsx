import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuotePreviewActions } from "@/features/quotes/components/QuotePreviewActions";

function makeProps(overrides: Partial<ComponentProps<typeof QuotePreviewActions>> = {}) {
  return {
    emailActionLabel: "Send Email",
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
  it("renders only the primary generate action for draft quotes", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
          emailActionLabel: null,
          openPdfUrl: null,
          shareUrl: null,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: /generate pdf/i })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /quote utilities/i })).not.toBeInTheDocument();
  });

  it("renders generate pdf as primary with send and copy utilities for ready quotes", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
          openPdfUrl: null,
          shareUrl: null,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: /generate pdf/i })).toBeInTheDocument();
    const utilities = screen.getByRole("group", { name: /quote utilities/i });
    expect(within(utilities).getByRole("button", { name: /send email/i })).toBeInTheDocument();
    expect(within(utilities).getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    expect(utilities).toHaveClass("sm:grid-cols-2");
  });

  it("renders open pdf as primary with resend and copy utilities for shared quotes", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
          emailActionLabel: "Resend Email",
        })}
      />,
    );

    expect(screen.getByRole("link", { name: /open pdf/i })).toHaveAttribute(
      "href",
      "blob:quote-preview",
    );
    const utilities = screen.getByRole("group", { name: /quote utilities/i });
    expect(within(utilities).getByRole("button", { name: /resend email/i })).toBeInTheDocument();
    expect(within(utilities).getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  });

  it("renders open pdf as primary with resend and copy utilities for closed quotes", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
          emailActionLabel: "Resend Email",
        })}
      />,
    );

    expect(screen.getByRole("link", { name: /open pdf/i })).toBeInTheDocument();
    const utilities = screen.getByRole("group", { name: /quote utilities/i });
    expect(within(utilities).getByRole("button", { name: /resend email/i })).toBeInTheDocument();
    expect(within(utilities).getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  });

  it("disables the email action and shows help text when customer email is missing", () => {
    render(
      <QuotePreviewActions
        {...makeProps({
          hasCustomerEmail: false,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: /send email/i })).toBeDisabled();
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

  it("calls the request-send-email handler when the email utility is pressed", () => {
    const onRequestSendEmail = vi.fn();
    render(
      <QuotePreviewActions
        {...makeProps({
          onRequestSendEmail,
        })}
      />,
    );

    fireEvent.click(
      within(screen.getByRole("group", { name: /quote utilities/i })).getByRole("button", {
        name: /send email/i,
      }),
    );

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
