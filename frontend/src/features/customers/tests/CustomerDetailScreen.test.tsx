import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CustomerDetailScreen } from "@/features/customers/components/CustomerDetailScreen";
import { customerService } from "@/features/customers/services/customerService";
import { quoteService } from "@/features/quotes/services/quoteService";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
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
  },
}));

vi.mock("@/features/quotes/services/quoteService", () => ({
  quoteService: {
    extract: vi.fn(),
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

const mockedCustomerService = vi.mocked(customerService);
const mockedQuoteService = vi.mocked(quoteService);

function renderScreen(): void {
  render(
    <MemoryRouter>
      <CustomerDetailScreen />
    </MemoryRouter>,
  );
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
      status: "draft",
      total_amount: 120,
      item_count: 1,
      created_at: "2026-03-20T00:00:00.000Z",
    },
    {
      id: "quote-2",
      customer_id: "cust-2",
      customer_name: "Bob Brown",
      doc_number: "Q-002",
      status: "ready",
      total_amount: 240,
      item_count: 2,
      created_at: "2026-03-21T00:00:00.000Z",
    },
  ]);
  mockedCustomerService.updateCustomer.mockResolvedValue({
    id: "cust-1",
    name: "Alice A. Johnson",
    phone: "555-9999",
    email: "alice+new@example.com",
    address: "2 Main St",
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-21T00:00:00.000Z",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CustomerDetailScreen", () => {
  it("renders customer name in app bar and populates editable fields", async () => {
    renderScreen();

    expect(await screen.findByRole("heading", { name: "Alice Johnson" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^name$/i)).toHaveValue("Alice Johnson");
    expect(screen.getByLabelText(/^phone$/i)).toHaveValue("555-0101");
    expect(screen.getByLabelText(/^email$/i)).toHaveValue("alice@example.com");
    expect(screen.getByLabelText(/^address$/i)).toHaveValue("1 Main St");
  });

  it("calls updateCustomer with edited values and shows success feedback", async () => {
    renderScreen();
    await screen.findByLabelText(/^name$/i);

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
      expect(mockedCustomerService.updateCustomer).toHaveBeenCalledWith("cust-1", {
        name: "Alice A. Johnson",
        phone: "555-9999",
        email: "alice+new@example.com",
        address: "2 Main St",
      });
    });

    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
  });

  it("navigates to quote capture for this customer", async () => {
    renderScreen();
    await screen.findByText("Q-001");

    fireEvent.click(screen.getByRole("button", { name: /create quote/i }));

    expect(navigateMock).toHaveBeenCalledWith("/quotes/capture/cust-1");
  });

  it("renders quote history filtered to this customer and opens preview on click", async () => {
    renderScreen();

    expect(await screen.findByText("Q-001")).toBeInTheDocument();
    expect(screen.queryByText("Q-002")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /q-001/i }));
    expect(navigateMock).toHaveBeenCalledWith("/quotes/quote-1/preview");
  });

  it("renders quote history empty state when customer has no quotes", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([
      {
        id: "quote-2",
        customer_id: "cust-2",
        customer_name: "Bob Brown",
        doc_number: "Q-002",
        status: "ready",
        total_amount: 240,
        item_count: 2,
        created_at: "2026-03-21T00:00:00.000Z",
      },
    ]);

    renderScreen();

    expect(await screen.findByText("No quotes yet.")).toBeInTheDocument();
  });

  it("renders BottomNav with customers tab active", async () => {
    renderScreen();
    await screen.findByText("Q-001");

    expect(screen.getByRole("button", { name: /group customers/i })).toHaveClass("text-primary");
  });
});
