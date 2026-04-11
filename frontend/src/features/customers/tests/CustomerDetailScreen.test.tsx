import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { CustomerDetailScreen } from "@/features/customers/components/CustomerDetailScreen";
import { customerService } from "@/features/customers/services/customerService";
import type { Customer } from "@/features/customers/types/customer.types";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { InvoiceListItem } from "@/features/invoices/types/invoice.types";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ id: "cust-1" }),
  };
});

vi.mock("@/features/customers/services/customerService", () => ({
  customerService: {
    listCustomers: vi.fn(),
    createCustomer: vi.fn(),
    getCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    deleteCustomer: vi.fn(),
  },
}));

vi.mock("@/features/quotes/services/quoteService", () => ({
  quoteService: {
    extract: vi.fn(),
    appendExtraction: vi.fn(),
    convertNotes: vi.fn(),
    captureAudio: vi.fn(),
    createQuote: vi.fn(),
    listQuotes: vi.fn(),
    getQuote: vi.fn(),
    updateQuote: vi.fn(),
    generatePdf: vi.fn(),
    shareQuote: vi.fn(),
  },
}));

vi.mock("@/features/invoices/services/invoiceService", () => ({
  invoiceService: {
    listInvoices: vi.fn(),
  },
}));

vi.mock("@/features/auth/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const mockedCustomerService = vi.mocked(customerService);
const mockedInvoiceService = vi.mocked(invoiceService);
const mockedQuoteService = vi.mocked(quoteService);
const mockedUseAuth = vi.mocked(useAuth);

function makeInvoice(
  overrides: Partial<InvoiceListItem> = {},
): InvoiceListItem {
  return {
    id: "invoice-1",
    customer_id: "cust-1",
    customer_name: "Alice Johnson",
    doc_number: "I-001",
    title: null,
    status: "draft",
    total_amount: 120,
    due_date: "2026-04-19",
    created_at: "2026-03-25T00:00:00.000Z",
    source_document_id: null,
    ...overrides,
  };
}

function renderScreen(): void {
  render(
    <MemoryRouter>
      <CustomerDetailScreen />
    </MemoryRouter>,
  );
}

async function openEditForm(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
  await screen.findByLabelText(/^name$/i);
}

async function switchToInvoicesTab(): Promise<void> {
  await screen.findByRole("heading", { level: 1, name: "Alice Johnson" });
  fireEvent.click(screen.getByRole("button", { name: "Invoices" }));
}

beforeEach(() => {
  mockedCustomerService.getCustomer.mockResolvedValue({
    id: "cust-1",
    name: "Alice Johnson",
    phone: "555-0101",
    email: "alice@example.com",
    address: "1 Main St",
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  });
  mockedQuoteService.listQuotes.mockResolvedValue([
    {
      id: "quote-1",
      customer_id: "cust-1",
      customer_name: "Alice Johnson",
      doc_number: "Q-001",
      title: null,
      status: "draft",
      total_amount: 120,
      item_count: 1,
      created_at: "2026-03-25T00:00:00.000Z",
    },
  ]);
  mockedInvoiceService.listInvoices.mockResolvedValue([
    makeInvoice({ source_document_id: "quote-1" }),
    makeInvoice({
      id: "invoice-2",
      doc_number: "I-002",
      title: "Final walkthrough",
      status: "ready",
      total_amount: 300,
      source_document_id: null,
      created_at: "2026-03-26T00:00:00.000Z",
    }),
  ]);
  mockedUseAuth.mockReturnValue({
    isLoading: false,
    isOnboarded: true,
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    refreshUser: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    user: {
      id: "user-1",
      email: "owner@example.com",
      is_active: true,
      is_onboarded: true,
      timezone: "America/New_York",
    },
  });
  mockedCustomerService.updateCustomer.mockResolvedValue({
    id: "cust-1",
    name: "Alice A. Johnson",
    phone: "555-9999",
    email: "alice+new@example.com",
    address: "2 Main St",
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-21T00:00:00.000Z",
  });
  mockedCustomerService.deleteCustomer.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CustomerDetailScreen", () => {
  it("renders the condensed customer summary by default", async () => {
    renderScreen();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Alice Johnson" }),
    ).toBeInTheDocument();
    expect(mockedQuoteService.listQuotes).toHaveBeenCalledWith({
      customer_id: "cust-1",
    });
    expect(mockedInvoiceService.listInvoices).toHaveBeenCalledWith({
      customer_id: "cust-1",
    });
    expect(screen.getByText("555-0101")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("1 Main St")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quotes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Invoices" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByText("1 ITEM")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();
  });

  it("shows loading state while fetching", () => {
    mockedCustomerService.getCustomer.mockImplementationOnce(
      () => new Promise<Customer>(() => {}),
    );
    mockedInvoiceService.listInvoices.mockImplementationOnce(
      () => new Promise<InvoiceListItem[]>(() => {}),
    );

    renderScreen();

    expect(screen.getByRole("status", { name: /loading customer/i })).toBeInTheDocument();
  });

  it("shows error when customer fetch fails", async () => {
    mockedCustomerService.getCustomer.mockRejectedValueOnce(
      new Error("Unable to load customer"),
    );

    renderScreen();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load customer",
    );
  });

  it("calls updateCustomer with edited values and shows success feedback", async () => {
    renderScreen();
    await openEditForm();

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "  Alice A. Johnson  " },
    });
    fireEvent.change(screen.getByLabelText(/^phone$/i), {
      target: { value: " 555-9999 " },
    });
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: " alice+new@example.com " },
    });
    fireEvent.change(screen.getByLabelText(/^address$/i), {
      target: { value: " 2 Main St " },
    });

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedCustomerService.updateCustomer).toHaveBeenCalledWith(
        "cust-1",
        {
          name: "Alice A. Johnson",
          phone: "555-9999",
          email: "alice+new@example.com",
          address: "2 Main St",
        },
      );
    });

    const savedToast = await screen.findByRole("status");
    expect(savedToast).toHaveTextContent("Saved");
    expect(savedToast).toHaveClass("bg-on-surface");
    expect(savedToast).not.toHaveClass("bg-success-container");
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Alice A. Johnson" }),
    ).toBeInTheDocument();
  });

  it("shows save error when update fails", async () => {
    mockedCustomerService.updateCustomer.mockRejectedValueOnce(
      new Error("Unable to save customer"),
    );

    renderScreen();
    await openEditForm();

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to save customer",
    );
  });

  it("sends null for optional fields when user clears them", async () => {
    mockedCustomerService.updateCustomer.mockResolvedValueOnce({
      id: "cust-1",
      name: "Alice Johnson",
      phone: null,
      email: "alice@example.com",
      address: "1 Main St",
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-21T00:00:00.000Z",
    });

    renderScreen();
    await openEditForm();

    fireEvent.change(screen.getByLabelText(/^phone$/i), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedCustomerService.updateCustomer).toHaveBeenCalledWith(
        "cust-1",
        {
          name: "Alice Johnson",
          phone: null,
          email: "alice@example.com",
          address: "1 Main St",
        },
      );
    });
  });

  it("shows em dash fallback for missing optional details in read view", async () => {
    mockedCustomerService.getCustomer.mockResolvedValueOnce({
      id: "cust-1",
      name: "Alice Johnson",
      phone: null,
      email: null,
      address: null,
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:00:00.000Z",
    });

    renderScreen();

    await screen.findByRole("heading", { level: 1, name: "Alice Johnson" });
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("navigates to quote capture for this customer", async () => {
    renderScreen();
    await screen.findByText("Q-001");

    fireEvent.click(screen.getByRole("button", { name: /create document/i }));

    expect(navigateMock).toHaveBeenCalledWith("/quotes/capture/cust-1", {
      state: { launchOrigin: "/customers/cust-1" },
    });
  });

  it("renders quote history filtered to this customer and opens preview on click", async () => {
    renderScreen();

    expect(await screen.findByText("Q-001")).toBeInTheDocument();
    expect(screen.getByText(/Mar 24, 2026\s*·\s*1 item/)).toBeInTheDocument();
    expect(screen.queryByText("Q-002")).not.toBeInTheDocument();
    expect(screen.queryByText("I-001")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /q-001/i }));
    expect(navigateMock).toHaveBeenCalledWith("/quotes/quote-1/preview");
  });

  it("renders invoice history filtered to this customer and opens detail on click", async () => {
    renderScreen();
    await switchToInvoicesTab();

    expect(await screen.findByText("I-001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invoices" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Quotes" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByText("2 ITEMS")).toBeInTheDocument();
    expect(screen.getByText("Mar 24, 2026")).toBeInTheDocument();
    expect(screen.getByText(/I-002\s*·\s*Mar 25, 2026/)).toBeInTheDocument();
    expect(screen.getByText("Final walkthrough")).toBeInTheDocument();
    expect(screen.queryByText("Q-001")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /i-001/i }));
    expect(navigateMock).toHaveBeenCalledWith("/invoices/invoice-1");
  });

  it("renders invoice history empty state when customer has no invoices", async () => {
    mockedInvoiceService.listInvoices.mockResolvedValueOnce([]);

    renderScreen();
    await switchToInvoicesTab();

    expect(await screen.findByText("No invoices yet.")).toBeInTheDocument();
  });

  it("renders invoice history error state without hiding the customer details", async () => {
    mockedInvoiceService.listInvoices.mockRejectedValueOnce(
      new Error("Unable to load invoices"),
    );

    renderScreen();
    await switchToInvoicesTab();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load invoices",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Alice Johnson" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Q-001")).not.toBeInTheDocument();
  });

  it("renders invoice history loading state while invoices are in flight", async () => {
    mockedInvoiceService.listInvoices.mockImplementationOnce(
      () => new Promise<InvoiceListItem[]>(() => {}),
    );

    renderScreen();
    await switchToInvoicesTab();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Alice Johnson" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /loading invoices/i })).toBeInTheDocument();
  });

  it("renders quote history empty state when customer has no quotes", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([]);

    renderScreen();

    expect(await screen.findByText("No quotes yet.")).toBeInTheDocument();
  });

  it("renders BottomNav with customers tab active", async () => {
    renderScreen();
    await screen.findByText("Q-001");

    expect(
      screen.getByRole("button", { name: /group customers/i }),
    ).toHaveClass("text-primary");
  });

  it("requires exact typed confirmation before enabling customer deletion", async () => {
    renderScreen();
    await screen.findByRole("heading", { level: 1, name: "Alice Johnson" });

    fireEvent.click(screen.getByRole("button", { name: /delete customer/i }));

    expect(await screen.findByRole("dialog", { name: "Delete customer?" })).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
    const deleteButton = screen.getByRole("button", { name: /^delete customer$/i });
    expect(deleteButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Type Alice Johnson to confirm"), {
      target: { value: "Alice" },
    });
    expect(deleteButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Type Alice Johnson to confirm"), {
      target: { value: "Alice Johnson" },
    });
    expect(deleteButton).toBeEnabled();
  });

  it("deletes customer and navigates to customer list with flash message", async () => {
    renderScreen();
    await screen.findByRole("heading", { level: 1, name: "Alice Johnson" });

    fireEvent.click(screen.getByRole("button", { name: /delete customer/i }));
    fireEvent.change(screen.getByLabelText("Type Alice Johnson to confirm"), {
      target: { value: "Alice Johnson" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^delete customer$/i }));

    await waitFor(() => {
      expect(mockedCustomerService.deleteCustomer).toHaveBeenCalledWith("cust-1");
    });
    expect(navigateMock).toHaveBeenCalledWith("/customers", {
      replace: true,
      state: { flashMessage: "Customer deleted" },
    });
  });

  it("shows modal error when customer deletion fails", async () => {
    mockedCustomerService.deleteCustomer.mockRejectedValueOnce(
      new Error("Unable to delete customer"),
    );
    renderScreen();
    await screen.findByRole("heading", { level: 1, name: "Alice Johnson" });

    fireEvent.click(screen.getByRole("button", { name: /delete customer/i }));
    fireEvent.change(screen.getByLabelText("Type Alice Johnson to confirm"), {
      target: { value: "Alice Johnson" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^delete customer$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to delete customer");
  });
});
