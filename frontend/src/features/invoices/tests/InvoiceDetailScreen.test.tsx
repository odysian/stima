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

function makeInvoiceDetail(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    id: "invoice-1",
    customer_id: "cust-1",
    doc_number: "I-001",
    title: "Spring cleanup",
    status: "draft",
    total_amount: 120,
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
        <Route path="/quotes/:id/preview" element={<div>Quote Preview Screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedInvoiceService.getInvoice.mockResolvedValue(makeInvoiceDetail());
  mockedInvoiceService.updateInvoice.mockResolvedValue(
    makeInvoice({ due_date: "2026-04-30", updated_at: "2026-03-20T00:10:00.000Z" }),
  );
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

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    writable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

describe("InvoiceDetailScreen", () => {
  it("loads the invoice detail and shows the source quote link", async () => {
    renderScreen();

    expect(await screen.findByRole("heading", { name: "Spring cleanup" })).toBeInTheDocument();
    expect(screen.getByText(/created from quote q-001/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to q-001/i })).toBeInTheDocument();
  });

  it("saves the due date update", async () => {
    renderScreen();

    const dueDateInput = await screen.findByLabelText(/invoice due date/i);
    fireEvent.change(dueDateInput, { target: { value: "2026-04-30" } });
    fireEvent.click(screen.getByRole("button", { name: /save due date/i }));

    await waitFor(() => {
      expect(mockedInvoiceService.updateInvoice).toHaveBeenCalledWith("invoice-1", {
        due_date: "2026-04-30",
      });
    });

    expect(await screen.findByText("Due date updated.")).toBeInTheDocument();
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
});
