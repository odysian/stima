import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvoiceDetailScreen } from "@/features/invoices/components/InvoiceDetailScreen";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import type { Invoice, InvoiceDetail } from "@/features/invoices/types/invoice.types";

vi.mock("@/features/invoices/services/invoiceService", () => ({
  invoiceService: {
    getInvoice: vi.fn(),
    updateInvoice: vi.fn(),
    generatePdf: vi.fn(),
    shareInvoice: vi.fn(),
  },
}));

const mockedInvoiceService = vi.mocked(invoiceService);
const createObjectUrlMock = vi.fn(() => "blob:invoice-preview");
const revokeObjectUrlMock = vi.fn();

function makeInvoiceDetail(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    id: "invoice-1",
    customer_id: "cust-1",
    doc_number: "I-001",
    title: "Spring cleanup",
    status: "draft",
    total_amount: 120,
    tax_rate: null,
    discount_type: null,
    discount_value: null,
    deposit_amount: null,
    notes: "Thanks for your business",
    due_date: "2026-04-19",
    shared_at: null,
    share_token: null,
    source_document_id: "quote-1",
    source_quote_number: "Q-001",
    customer: {
      id: "cust-1",
      name: "Alice Johnson",
      email: "alice@example.com",
      phone: "+1-555-0100",
    },
    line_items: [
      {
        id: "line-1",
        description: "Brown mulch",
        details: "5 yards",
        price: 120,
        sort_order: 0,
      },
    ],
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "invoice-1",
    customer_id: "cust-1",
    doc_number: "I-001",
    title: "Spring cleanup",
    status: "draft",
    total_amount: 120,
    tax_rate: null,
    discount_type: null,
    discount_value: null,
    deposit_amount: null,
    notes: "Thanks for your business",
    due_date: "2026-04-19",
    shared_at: null,
    share_token: null,
    source_document_id: "quote-1",
    line_items: [
      {
        id: "line-1",
        description: "Brown mulch",
        details: "5 yards",
        price: 120,
        sort_order: 0,
      },
    ],
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
    ...overrides,
  };
}

function renderScreen(path = "/invoices/invoice-1"): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invoices/:id" element={<InvoiceDetailScreen />} />
        <Route path="/invoices/:id/edit" element={<div>Invoice Edit Screen</div>} />
        <Route path="/quotes/:id/preview" element={<div>Quote Preview Screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedInvoiceService.getInvoice.mockResolvedValue(makeInvoiceDetail());
  mockedInvoiceService.generatePdf.mockResolvedValue(
    new Blob(["invoice-pdf"], { type: "application/pdf" }),
  );
  mockedInvoiceService.shareInvoice.mockResolvedValue(
    makeInvoice({
      status: "sent",
      share_token: "invoice-share-token-1",
      shared_at: "2026-03-20T00:15:00.000Z",
      updated_at: "2026-03-20T00:15:00.000Z",
    }),
  );
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: createObjectUrlMock,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: revokeObjectUrlMock,
  });

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    writable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

describe("InvoiceDetailScreen", () => {
  it("loads the invoice detail, shows the source quote link, and exposes edit", async () => {
    renderScreen();

    expect(await screen.findByRole("heading", { name: "Spring cleanup" })).toBeInTheDocument();
    expect(screen.getByText(/created from quote q-001/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to q-001/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit invoice/i })).toBeInTheDocument();
    expect(screen.getByText("Thanks for your business")).toBeInTheDocument();
    expect(screen.getByText("Apr 19, 2026")).toBeInTheDocument();
  });

  it("hides source quote UI for direct invoices", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        source_document_id: null,
        source_quote_number: null,
      }),
    );

    renderScreen();

    expect(await screen.findByRole("heading", { name: "Spring cleanup" })).toBeInTheDocument();
    expect(screen.getByText(/created on mar 20, 2026/i)).toBeInTheDocument();
    expect(screen.queryByText(/created from quote/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /back to/i })).not.toBeInTheDocument();
  });

  it("keeps sent invoices editable by leaving the edit action available", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        status: "sent",
        share_token: "invoice-share-token-1",
        shared_at: "2026-03-20T00:15:00.000Z",
      }),
    );

    renderScreen();

    expect(await screen.findByRole("heading", { name: "Spring cleanup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit invoice/i })).toBeInTheDocument();
    expect(screen.queryByText(/sent invoices are read-only/i)).not.toBeInTheDocument();
  });

  it("navigates to the invoice editor when edit is clicked", async () => {
    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /edit invoice/i }));

    expect(await screen.findByText("Invoice Edit Screen")).toBeInTheDocument();
  });

  it("shares the invoice using the raw /share token URL", async () => {
    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /copy link/i }));

    await waitFor(() => {
      expect(mockedInvoiceService.shareInvoice).toHaveBeenCalledWith("invoice-1");
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "http://localhost:3000/share/invoice-share-token-1",
    );
    expect(await screen.findByText("Invoice link copied to clipboard.")).toBeInTheDocument();
  });

  it("clears a generated local PDF after sharing the invoice", async () => {
    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: "Generate PDF" }));

    const openPdfLink = (await screen.findByText("Open PDF")).closest("a");
    expect(openPdfLink).toHaveAttribute("href", "blob:invoice-preview");

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    await waitFor(() => {
      expect(mockedInvoiceService.shareInvoice).toHaveBeenCalledWith("invoice-1");
    });
    await waitFor(() => {
      expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:invoice-preview");
    });
    expect(screen.queryByRole("link", { name: "Open PDF" })).not.toBeInTheDocument();
  });
});
