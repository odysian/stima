import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PublicQuotePage } from "@/features/public/components/PublicQuotePage";
import {
  PublicRequestError,
  publicService,
} from "@/features/public/services/publicService";
import type { PublicInvoice, PublicQuote } from "@/features/public/types/public.types";

vi.mock("@/features/public/services/publicService", async () => {
  const actual = await vi.importActual<typeof import("@/features/public/services/publicService")>(
    "@/features/public/services/publicService",
  );

  return {
    ...actual,
    publicService: {
      getDocument: vi.fn(),
    },
  };
});

const mockedPublicService = vi.mocked(publicService);

function makePublicQuote(overrides: Partial<PublicQuote> = {}): PublicQuote {
  return {
    doc_type: "quote",
    business_name: "Northline Landscaping",
    owner_name: "Taylor Owner",
    customer_name: "Taylor Morgan",
    doc_number: "Q-001",
    title: "Spring Cleanup",
    status: "viewed",
    total_amount: 425,
    tax_rate: null,
    discount_type: null,
    discount_value: null,
    deposit_amount: null,
    notes: "Includes disposal and bed edging.",
    issued_date: "Mar 28, 2026",
    logo_url: "https://example.com/logo.png",
    download_url: "https://api.example.com/share/token-1",
    line_items: [
      {
        description: "Mulch refresh",
        details: "Front beds",
        price: 225,
      },
      {
        description: "Yard cleanup",
        details: null,
        price: 200,
      },
    ],
    ...overrides,
  };
}

function makePublicInvoice(overrides: Partial<PublicInvoice> = {}): PublicInvoice {
  return {
    doc_type: "invoice",
    business_name: "Northline Landscaping",
    owner_name: "Taylor Owner",
    customer_name: "Taylor Morgan",
    doc_number: "I-001",
    title: "Spring Cleanup Invoice",
    status: "sent",
    total_amount: 425,
    tax_rate: null,
    discount_type: null,
    discount_value: null,
    deposit_amount: null,
    notes: "Payment due on receipt.",
    issued_date: "Apr 04, 2026",
    due_date: "May 04, 2026",
    logo_url: "https://example.com/logo.png",
    download_url: "https://api.example.com/share/invoice-token-1",
    line_items: [
      {
        description: "Mulch refresh",
        details: "Front beds",
        price: 425,
      },
    ],
    ...overrides,
  };
}

function renderScreen(path = "/doc/token-1"): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/doc/:token" element={<PublicQuotePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedPublicService.getDocument.mockResolvedValue(makePublicQuote());
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("PublicQuotePage", () => {
  it("renders the public quote details and mounts a noindex meta tag", async () => {
    mockedPublicService.getDocument.mockResolvedValueOnce(
      makePublicQuote({ status: "approved" }),
    );

    renderScreen();

    expect(await screen.findByRole("heading", { name: "Spring Cleanup" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("screen-radial-backdrop");
    expect(mockedPublicService.getDocument).toHaveBeenCalledWith("token-1");
    expect(screen.getByText("This quote has been accepted")).toBeInTheDocument();
    expect(screen.getByText("Northline Landscaping")).toHaveClass("text-on-primary/70");
    expect(screen.getByText("Taylor Morgan")).toBeInTheDocument();
    expect(screen.getByText("$425.00")).toBeInTheDocument();
    expect(screen.getByText("Mulch refresh")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download pdf/i })).toHaveAttribute(
      "href",
      "https://api.example.com/share/token-1",
    );
    expect(
      document.head.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toBe("noindex");
    expect(screen.queryByRole("button", { name: /mark as won/i })).not.toBeInTheDocument();
  });

  it("shows the invalid-link state when the token is unknown", async () => {
    mockedPublicService.getDocument.mockRejectedValueOnce(
      new PublicRequestError("Not found", 404),
    );

    renderScreen();

    expect(await screen.findByRole("heading", { name: "This link is not valid" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("screen-radial-backdrop");
    expect(screen.queryByRole("link", { name: /download pdf/i })).not.toBeInTheDocument();
  });

  it("shows the generic error state when the request fails for another reason", async () => {
    mockedPublicService.getDocument.mockRejectedValueOnce(new Error("Server exploded"));

    renderScreen();

    expect(await screen.findByRole("heading", { name: /we couldn't load this document/i })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("screen-radial-backdrop");
    expect(screen.queryByRole("link", { name: /download pdf/i })).not.toBeInTheDocument();
  });

  it("falls back cleanly when the public logo request fails", async () => {
    renderScreen();

    await screen.findByRole("heading", { name: "Spring Cleanup" });
    const logo = screen.getByRole("img", { name: /northline landscaping logo/i });
    fireEvent.error(logo);

    await waitFor(() => {
      expect(
        screen.queryByRole("img", { name: /northline landscaping logo/i }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText(/^N$/)).toBeInTheDocument();
  });

  it("renders the optional pricing breakdown when public pricing controls are present", async () => {
    mockedPublicService.getDocument.mockResolvedValueOnce(
      makePublicQuote({
        total_amount: 99,
        tax_rate: 0.1,
        discount_type: "fixed",
        discount_value: 10,
        deposit_amount: 40,
        line_items: [
          {
            description: "Mulch refresh",
            details: "Front beds",
            price: 100,
          },
        ],
      }),
    );

    renderScreen();

    expect(await screen.findByText("Subtotal")).toBeInTheDocument();
    expect(screen.getByText("Discount")).toBeInTheDocument();
    expect(screen.getByText("Tax")).toBeInTheDocument();
    expect(screen.getByText("Deposit")).toBeInTheDocument();
    expect(screen.getByText("Balance Due")).toBeInTheDocument();
    expect(screen.getByText("-$10.00")).toBeInTheDocument();
    expect(screen.getByText("$9.00")).toBeInTheDocument();
    expect(screen.getByText("$59.00")).toBeInTheDocument();
  });

  it("renders invoice variants without quote-only status messaging", async () => {
    mockedPublicService.getDocument.mockResolvedValueOnce(makePublicInvoice());

    renderScreen();

    expect(await screen.findByRole("heading", { name: "Spring Cleanup Invoice" })).toBeInTheDocument();
    expect(screen.getByText("Invoice I-001 · Issued Apr 04, 2026")).toBeInTheDocument();
    expect(screen.getByText("Due Date")).toBeInTheDocument();
    expect(screen.getByText("May 04, 2026")).toBeInTheDocument();
    expect(screen.queryByText("This quote has been accepted")).not.toBeInTheDocument();
  });

  it("falls back to owner name when business name is missing", async () => {
    mockedPublicService.getDocument.mockResolvedValueOnce(
      makePublicQuote({
        business_name: null,
        owner_name: "Jamie Owner",
      }),
    );

    renderScreen();

    expect(await screen.findByText("Jamie Owner")).toBeInTheDocument();
    expect(document.title).toContain("Jamie Owner");
  });

  it("omits the business name line when both business and owner names are missing", async () => {
    mockedPublicService.getDocument.mockResolvedValueOnce(
      makePublicQuote({
        business_name: null,
        owner_name: null,
      }),
    );

    renderScreen();

    expect(await screen.findByRole("heading", { name: "Spring Cleanup" })).toBeInTheDocument();
    expect(screen.queryByText("Northline Landscaping")).not.toBeInTheDocument();
    expect(screen.queryByText("Taylor Owner")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /quote logo/i })).toBeInTheDocument();
  });
});
