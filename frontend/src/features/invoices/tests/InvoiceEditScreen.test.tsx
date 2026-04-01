import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InvoiceEditScreen } from "@/features/invoices/components/InvoiceEditScreen";
import type { InvoiceEditDraft } from "@/features/invoices/hooks/useInvoiceEdit";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import type { Invoice, InvoiceDetail } from "@/features/invoices/types/invoice.types";

const EDIT_STORAGE_KEY = "stima_invoice_edit";
const navigateMock = vi.fn();
const useParamsMock = vi.fn(() => ({ id: "invoice-1" }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => useParamsMock(),
  };
});

vi.mock("@/features/invoices/services/invoiceService", () => ({
  invoiceService: {
    createInvoice: vi.fn(),
    getInvoice: vi.fn(),
    listInvoices: vi.fn(),
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
    title: null,
    status: "ready",
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
      name: "Test Customer",
      email: null,
      phone: null,
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
    title: "Patio Refresh",
    status: "ready",
    total_amount: 145,
    tax_rate: null,
    discount_type: null,
    discount_value: null,
    deposit_amount: null,
    notes: "Updated note",
    due_date: "2026-04-30",
    shared_at: null,
    share_token: null,
    source_document_id: "quote-1",
    line_items: [],
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
    ...overrides,
  };
}

function makeDraft(overrides: Partial<InvoiceEditDraft> = {}): InvoiceEditDraft {
  return {
    invoiceId: "invoice-1",
    title: "",
    lineItems: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
    total: 120,
    taxRate: null,
    discountType: null,
    discountValue: null,
    depositAmount: null,
    notes: "Thanks for your business",
    dueDate: "2026-04-19",
    ...overrides,
  };
}

function renderScreen(): void {
  render(
    <MemoryRouter>
      <InvoiceEditScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  useParamsMock.mockReturnValue({ id: "invoice-1" });
  mockedInvoiceService.getInvoice.mockResolvedValue(makeInvoiceDetail());
  mockedInvoiceService.updateInvoice.mockResolvedValue(makeInvoice());
});

afterEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe("InvoiceEditScreen", () => {
  it("seeds edit state from the fetched invoice when no draft exists", async () => {
    renderScreen();

    await waitFor(() => {
      expect(mockedInvoiceService.getInvoice).toHaveBeenCalledWith("invoice-1");
    });
    await waitFor(() => {
      expect(JSON.parse(window.sessionStorage.getItem(EDIT_STORAGE_KEY) ?? "")).toEqual({
        invoiceId: "invoice-1",
        title: "",
        lineItems: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
        total: 120,
        taxRate: null,
        discountType: null,
        discountValue: null,
        depositAmount: null,
        notes: "Thanks for your business",
        dueDate: "2026-04-19",
      });
    });
  });

  it("shows a load error when the invoice fetch fails", async () => {
    mockedInvoiceService.getInvoice.mockRejectedValueOnce(new Error("Unable to load invoice"));

    renderScreen();

    expect(await screen.findByText("Unable to load invoice")).toBeInTheDocument();
    expect(mockedInvoiceService.updateInvoice).not.toHaveBeenCalled();
  });

  it.each(["draft", "ready", "sent"] as const)(
    "keeps invoices editable in the editor (%s)",
    async (status) => {
      window.sessionStorage.setItem(EDIT_STORAGE_KEY, JSON.stringify(makeDraft()));
      mockedInvoiceService.getInvoice.mockResolvedValueOnce(
        makeInvoiceDetail({ status, share_token: status === "sent" ? "share-token-1" : null }),
      );

      renderScreen();

      expect(await screen.findByRole("heading", { name: "I-001" })).toBeInTheDocument();
      expect(navigateMock).not.toHaveBeenCalledWith("/invoices/invoice-1", { replace: true });
      expect(window.sessionStorage.getItem(EDIT_STORAGE_KEY)).not.toBeNull();
    },
  );

  it("saves changes, clears the edit draft, and navigates back to detail", async () => {
    window.sessionStorage.setItem(EDIT_STORAGE_KEY, JSON.stringify(makeDraft()));

    renderScreen();

    expect(await screen.findByRole("heading", { name: "I-001" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/invoice title/i), {
      target: { value: "  Patio Refresh  " },
    });
    fireEvent.change(screen.getByLabelText(/customer notes/i), {
      target: { value: "Updated note" },
    });
    fireEvent.change(screen.getByLabelText(/total amount/i), {
      target: { value: "145" },
    });
    fireEvent.change(screen.getByLabelText(/invoice due date/i), {
      target: { value: "2026-04-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedInvoiceService.updateInvoice).toHaveBeenCalledWith("invoice-1", {
        title: "Patio Refresh",
        line_items: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
        total_amount: 145,
        tax_rate: null,
        discount_type: null,
        discount_value: null,
        deposit_amount: null,
        notes: "Updated note",
        due_date: "2026-04-30",
      });
    });
    expect(window.sessionStorage.getItem(EDIT_STORAGE_KEY)).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith("/invoices/invoice-1");
  });

  it("falls back to the doc number after clearing a saved title and submits null", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        title: "Patio Refresh",
      }),
    );

    renderScreen();

    expect(await screen.findByRole("heading", { name: "Patio Refresh" })).toBeInTheDocument();
    expect(
      screen.getByText("I-001 · INVOICE EDITOR"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/invoice title/i), {
      target: { value: "   " },
    });

    expect(screen.getByRole("heading", { name: "I-001" })).toBeInTheDocument();
    expect(screen.getByText("INVOICE EDITOR")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedInvoiceService.updateInvoice).toHaveBeenCalledWith("invoice-1", {
        title: null,
        line_items: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
        total_amount: 120,
        tax_rate: null,
        discount_type: null,
        discount_value: null,
        deposit_amount: null,
        notes: "Thanks for your business",
        due_date: "2026-04-19",
      });
    });
  });

  it("allows editing an invoice with a null persisted due date by omitting due_date from the patch", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        due_date: null,
      }),
    );

    renderScreen();

    expect(await screen.findByRole("heading", { name: "I-001" })).toBeInTheDocument();
    expect(await screen.findByLabelText(/invoice due date/i)).toHaveValue("");

    fireEvent.change(await screen.findByLabelText(/customer notes/i), {
      target: { value: "Updated note without a due date" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedInvoiceService.updateInvoice).toHaveBeenCalledWith("invoice-1", {
        title: null,
        line_items: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
        total_amount: 120,
        tax_rate: null,
        discount_type: null,
        discount_value: null,
        deposit_amount: null,
        notes: "Updated note without a due date",
      });
    });
  });

  it("blocks save when a line item has details or price but no description", async () => {
    window.sessionStorage.setItem(
      EDIT_STORAGE_KEY,
      JSON.stringify(
        makeDraft({
          lineItems: [{ description: "   ", details: "5 yards", price: 120 }],
        }),
      ),
    );

    renderScreen();

    expect(await screen.findByRole("heading", { name: "I-001" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(
      await screen.findByText("Each line item with details or price needs a description."),
    ).toBeInTheDocument();
    expect(mockedInvoiceService.updateInvoice).not.toHaveBeenCalled();
  });

  it("blocks save when all line items have been removed", async () => {
    window.sessionStorage.setItem(
      EDIT_STORAGE_KEY,
      JSON.stringify(
        makeDraft({
          lineItems: [],
        }),
      ),
    );

    renderScreen();

    expect(await screen.findByRole("heading", { name: "I-001" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(
      await screen.findByText("Add at least one line item description before saving the invoice."),
    ).toBeInTheDocument();
    expect(mockedInvoiceService.updateInvoice).not.toHaveBeenCalled();
  });

  it("navigates to the line item edit route when a card is clicked", async () => {
    window.sessionStorage.setItem(EDIT_STORAGE_KEY, JSON.stringify(makeDraft()));

    renderScreen();

    const lineItemCard = await screen.findByRole("button", { name: /brown mulch/i });
    fireEvent.click(lineItemCard);

    expect(navigateMock).toHaveBeenCalledWith("/invoices/invoice-1/edit/line-items/0/edit");
  });

  it("clears the edit draft and returns to detail on cancel", async () => {
    window.sessionStorage.setItem(EDIT_STORAGE_KEY, JSON.stringify(makeDraft()));

    renderScreen();

    await screen.findByRole("heading", { name: "I-001" });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(window.sessionStorage.getItem(EDIT_STORAGE_KEY)).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith("/invoices/invoice-1");
  });
});
