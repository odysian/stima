import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { CustomerDetailScreen } from "@/features/customers/components/CustomerDetailScreen";
import { customerService } from "@/features/customers/services/customerService";
import type { Customer } from "@/features/customers/types/customer.types";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { InvoiceListItem } from "@/features/invoices/types/invoice.types";
import { ToastProvider } from "@/ui/Toast";

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
    createManualDraft: vi.fn(),
    convertNotes: vi.fn(),
    createQuote: vi.fn(),
    listQuotes: vi.fn(),
    listReuseCandidates: vi.fn(),
    duplicateQuote: vi.fn(),
    getQuote: vi.fn(),
    updateQuote: vi.fn(),
    updateExtractionReviewMetadata: vi.fn(),
    deleteQuote: vi.fn(),
    generatePdf: vi.fn(),
    shareQuote: vi.fn(),
    revokeShare: vi.fn(),
    sendQuoteEmail: vi.fn(),
    markQuoteWon: vi.fn(),
    markQuoteLost: vi.fn(),
    convertToInvoice: vi.fn(),
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
      <ToastProvider>
        <CustomerDetailScreen />
      </ToastProvider>
    </MemoryRouter>,
  );
}

async function openEditForm(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
  await screen.findByLabelText(/^name$/i);
}

async function switchToInvoicesTab(): Promise<void> {
  await screen.findByRole("heading", { level: 1, name: "Alice Johnson" });
  const modeButtons = screen.getAllByRole("button", { name: "Invoices" });
  fireEvent.click(modeButtons[0]);
}

async function openDeleteCustomerModal(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: /customer actions/i }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /delete customer/i }));
  await screen.findByRole("dialog", { name: "Delete customer?" });
}

beforeEach(() => {
  mockedCustomerService.getCustomer.mockResolvedValue({
    id: "cust-1",
    name: "Alice Johnson",
    phone: "555-0101",
    email: "alice@example.com",
    address: "1 Main St",
    address_line1: "1 Main St",
    address_line2: null,
    city: null,
    state: null,
    postal_code: null,
    formatted_address: null,
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
    authMode: "verified",
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
    address_line1: "2 Main St",
    address_line2: null,
    city: null,
    state: null,
    postal_code: null,
    formatted_address: null,
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
    expect(screen.getByRole("button", { name: /create document/i })).toHaveClass("w-full");
    expect(screen.getByRole("button", { name: /^edit$/i })).toHaveClass("w-full");
    expect(screen.getByRole("button", { name: /customer actions/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^delete customer$/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Quotes" })[0]).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByRole("button", { name: "Invoices" })[0]).toHaveAttribute(
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
    fireEvent.change(screen.getByLabelText(/street address or p\.o\. box/i), {
      target: { value: " 2 Main St " },
    });
    fireEvent.change(screen.getByLabelText(/^city$/i), {
      target: { value: "  Denver " },
    });
    fireEvent.change(screen.getByLabelText(/^state$/i), {
      target: { value: "OH" },
    });
    fireEvent.change(screen.getByLabelText(/zip code/i), {
      target: { value: " 80210 " },
    });

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedCustomerService.updateCustomer).toHaveBeenCalledWith(
        "cust-1",
        {
          name: "Alice A. Johnson",
          phone: "555-9999",
          email: "alice+new@example.com",
          address_line1: "2 Main St",
          address_line2: null,
          city: "Denver",
          state: "OH",
          postal_code: "80210",
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

  it("renders grouped address fields and state select in edit mode", async () => {
    renderScreen();
    await openEditForm();

    expect(screen.getByLabelText(/^phone$/i)).toHaveAttribute("placeholder", "(555) 123-4567");
    expect(screen.getByLabelText(/^phone$/i)).toHaveAttribute("type", "tel");
    expect(screen.getByLabelText(/^phone$/i)).toHaveAttribute("inputMode", "tel");
    expect(screen.getByText(/^address$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/street address or p\.o\. box/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/apt, suite, unit, building \(optional\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^state$/i)).toHaveValue("");
    expect(screen.getByRole("option", { name: "Select" })).toHaveValue("");
    expect(screen.getByLabelText(/zip code/i)).toBeInTheDocument();
    expect(screen.queryByText(/postal code/i)).not.toBeInTheDocument();
  });

  it("sends null for optional fields when user clears them", async () => {
    mockedCustomerService.updateCustomer.mockResolvedValueOnce({
      id: "cust-1",
      name: "Alice Johnson",
      phone: null,
      email: "alice@example.com",
      address: "1 Main St",
      address_line1: "1 Main St",
      address_line2: null,
      city: null,
      state: null,
      postal_code: null,
      formatted_address: null,
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
          address_line1: "1 Main St",
          address_line2: null,
          city: null,
          state: null,
          postal_code: null,
        },
      );
    });
  });

  it("prefers formatted_address over legacy address in read view", async () => {
    mockedCustomerService.getCustomer.mockResolvedValueOnce({
      id: "cust-1",
      name: "Alice Johnson",
      phone: "555-0101",
      email: "alice@example.com",
      address: "legacy address",
      address_line1: "1 Main St",
      address_line2: null,
      city: "Denver",
      state: "CO",
      postal_code: "80210",
      formatted_address: "1 Main St\nDenver, CO 80210",
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:00:00.000Z",
    });

    renderScreen();

    await screen.findByRole("heading", { level: 1, name: "Alice Johnson" });
    expect(screen.getByText(/1 Main St\s+Denver, CO 80210/)).toBeInTheDocument();
    expect(screen.queryByText("legacy address")).not.toBeInTheDocument();
  });

  it("shows em dash fallback for missing optional details in read view", async () => {
    mockedCustomerService.getCustomer.mockResolvedValueOnce({
      id: "cust-1",
      name: "Alice Johnson",
      phone: null,
      email: null,
      address: null,
      address_line1: null,
      address_line2: null,
      city: null,
      state: null,
      postal_code: null,
      formatted_address: null,
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:00:00.000Z",
    });

    renderScreen();

    await screen.findByRole("heading", { level: 1, name: "Alice Johnson" });
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("opens create entry sheet and starts a customer-scoped new quote", async () => {
    renderScreen();
    await screen.findByText("Q-001");

    fireEvent.click(screen.getByRole("button", { name: /create document/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Create new" }));

    expect(navigateMock).toHaveBeenCalledWith("/quotes/capture/cust-1", {
      state: { launchOrigin: "/customers/cust-1" },
    });
  });

  it("duplicates from existing quotes scoped to this customer", async () => {
    mockedQuoteService.listReuseCandidates.mockResolvedValueOnce([
      {
        id: "quote-source-1",
        title: "Fence Repair",
        doc_number: "Q-021",
        customer_id: "cust-1",
        customer_name: "Alice Johnson",
        total_amount: 220,
        created_at: "2026-03-25T00:00:00.000Z",
        status: "ready",
        line_item_previews: [{ description: "Fence panel", price: 220 }],
        line_item_count: 1,
        more_line_item_count: 0,
      },
    ]);
    mockedQuoteService.duplicateQuote.mockResolvedValueOnce({
      id: "quote-duplicate-1",
      customer_id: "cust-1",
      doc_type: "quote",
      doc_number: "Q-022",
      title: "Fence Repair",
      status: "draft",
      source_type: "text",
      transcript: "",
      total_amount: 220,
      tax_rate: null,
      discount_type: null,
      discount_value: null,
      deposit_amount: null,
      notes: null,
      shared_at: null,
      share_token: null,
      line_items: [],
      created_at: "2026-03-26T00:00:00.000Z",
      updated_at: "2026-03-26T00:00:00.000Z",
    });

    renderScreen();
    await screen.findByText("Q-001");

    fireEvent.click(screen.getByRole("button", { name: /create document/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Create from existing" }));
    fireEvent.click(await screen.findByRole("button", { name: /fence repair/i }));

    await waitFor(() => {
      expect(mockedQuoteService.listReuseCandidates).toHaveBeenCalledWith({
        customer_id: "cust-1",
        q: undefined,
      });
    });
    await waitFor(() => {
      expect(mockedQuoteService.duplicateQuote).toHaveBeenCalledWith("quote-source-1");
    });
    expect(navigateMock).toHaveBeenCalledWith("/documents/quote-duplicate-1/edit");
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
    expect(screen.getAllByRole("button", { name: "Invoices" })[0]).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByRole("button", { name: "Quotes" })[0]).toHaveAttribute(
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
    const emptyState = screen.getByText("No invoices yet.").closest("section");
    expect(emptyState?.querySelector("svg.text-3xl")).toBeInTheDocument();
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
    const emptyState = screen.getByText("No quotes yet.").closest("section");
    expect(emptyState?.querySelector("svg.text-3xl")).toBeInTheDocument();
  });

  it("renders BottomNav with customers tab active", async () => {
    renderScreen();
    await screen.findByText("Q-001");

    const nav = screen.getByRole("navigation");
    expect(within(nav).getByRole("button", { name: "Customers" })).toHaveClass("text-primary");
  });

  it("requires exact typed confirmation before enabling customer deletion", async () => {
    renderScreen();
    await screen.findByRole("heading", { level: 1, name: "Alice Johnson" });

    await openDeleteCustomerModal();
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

    await openDeleteCustomerModal();
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

    await openDeleteCustomerModal();
    fireEvent.change(screen.getByLabelText("Type Alice Johnson to confirm"), {
      target: { value: "Alice Johnson" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^delete customer$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to delete customer");
  });
});
