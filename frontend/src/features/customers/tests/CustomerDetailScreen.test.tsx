import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { CustomerDetailScreen } from "@/features/customers/components/CustomerDetailScreen";
import { customerService } from "@/features/customers/services/customerService";
import type { Customer } from "@/features/customers/types/customer.types";
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

vi.mock("@/features/auth/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const mockedCustomerService = vi.mocked(customerService);
const mockedQuoteService = vi.mocked(quoteService);
const mockedUseAuth = vi.mocked(useAuth);

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
      created_at: "2026-03-25T00:00:00.000Z",
    },
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
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CustomerDetailScreen", () => {
  it("renders customer name in app bar and populates editable fields", async () => {
    renderScreen();

    expect(await screen.findByRole("heading", { name: "Alice Johnson" })).toBeInTheDocument();
    expect(mockedQuoteService.listQuotes).toHaveBeenCalledWith({ customer_id: "cust-1" });
    expect(screen.getByLabelText(/^name$/i)).toHaveValue("Alice Johnson");
    expect(screen.getByLabelText(/^phone$/i)).toHaveValue("555-0101");
    expect(screen.getByLabelText(/^email$/i)).toHaveValue("alice@example.com");
    expect(screen.getByLabelText(/^address$/i)).toHaveValue("1 Main St");
  });

  it("shows loading state while fetching", () => {
    mockedCustomerService.getCustomer.mockImplementationOnce(() => new Promise<Customer>(() => {}));

    renderScreen();

    expect(screen.getByRole("status")).toHaveTextContent("Loading customer...");
  });

  it("shows error when customer fetch fails", async () => {
    mockedCustomerService.getCustomer.mockRejectedValueOnce(new Error("Unable to load customer"));

    renderScreen();

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load customer");
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

  it("shows save error when update fails", async () => {
    mockedCustomerService.updateCustomer.mockRejectedValueOnce(new Error("Unable to save customer"));

    renderScreen();
    await screen.findByLabelText(/^name$/i);

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save customer");
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
    await screen.findByLabelText(/^phone$/i);

    fireEvent.change(screen.getByLabelText(/^phone$/i), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedCustomerService.updateCustomer).toHaveBeenCalledWith("cust-1", {
        name: "Alice Johnson",
        phone: null,
        email: "alice@example.com",
        address: "1 Main St",
      });
    });
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
    expect(screen.getByText(/Mar 24, 2026\s*·\s*1 item/)).toBeInTheDocument();
    expect(screen.queryByText("Q-002")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /q-001/i }));
    expect(navigateMock).toHaveBeenCalledWith("/quotes/quote-1/preview");
  });

  it("renders quote history empty state when customer has no quotes", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([]);

    renderScreen();

    expect(await screen.findByText("No quotes yet.")).toBeInTheDocument();
  });

  it("renders BottomNav with customers tab active", async () => {
    renderScreen();
    await screen.findByText("Q-001");

    expect(screen.getByRole("button", { name: /group customers/i })).toHaveClass("text-primary");
  });
});
