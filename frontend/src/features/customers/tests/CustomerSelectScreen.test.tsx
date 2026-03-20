import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CustomerSelectScreen } from "@/features/customers/components/CustomerSelectScreen";
import { customerService } from "@/features/customers/services/customerService";
import type { Customer } from "@/features/customers/types/customer.types";

const navigateMock = vi.fn();
const clearDraftMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
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

vi.mock("@/features/quotes/hooks/useQuoteDraft", () => ({
  useQuoteDraft: () => ({
    draft: null,
    setDraft: vi.fn(),
    clearDraft: clearDraftMock,
  }),
}));

const mockedCustomerService = vi.mocked(customerService);

const customersFixture: Customer[] = [
  {
    id: "cust-1",
    name: "Alice Johnson",
    phone: "555-0101",
    email: "alice@example.com",
    address: null,
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  },
  {
    id: "cust-2",
    name: "Bob Brown",
    phone: null,
    email: "bob@example.com",
    address: null,
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  },
];

function renderScreen(): void {
  render(
    <MemoryRouter>
      <CustomerSelectScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedCustomerService.listCustomers.mockResolvedValue(customersFixture);
  mockedCustomerService.createCustomer.mockResolvedValue({
    id: "cust-new",
    name: "New Customer",
    phone: "555-0109",
    email: "new@example.com",
    address: "100 River Rd",
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CustomerSelectScreen", () => {
  it("renders search input and loading state on mount", async () => {
    let resolveList: ((customers: Customer[]) => void) | undefined;
    mockedCustomerService.listCustomers.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );

    renderScreen();

    expect(screen.getByLabelText(/search customers/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading customers...");
    expect(clearDraftMock).toHaveBeenCalledTimes(1);

    resolveList?.(customersFixture);
    expect(await screen.findByText("Alice Johnson")).toBeInTheDocument();
  });

  it("renders the customer list after load resolves", async () => {
    renderScreen();

    expect(await screen.findByText("Alice Johnson")).toBeInTheDocument();
    expect(screen.getByText("Bob Brown")).toBeInTheDocument();
  });

  it("filters list when user types in search input", async () => {
    renderScreen();
    await screen.findByText("Alice Johnson");

    fireEvent.change(screen.getByLabelText(/search customers/i), {
      target: { value: "bob" },
    });

    expect(screen.queryByText("Alice Johnson")).not.toBeInTheDocument();
    expect(screen.getByText("Bob Brown")).toBeInTheDocument();
  });

  it("shows all customers when query is cleared", async () => {
    renderScreen();
    await screen.findByText("Alice Johnson");

    const searchInput = screen.getByLabelText(/search customers/i);
    fireEvent.change(searchInput, { target: { value: "alice" } });
    expect(screen.queryByText("Bob Brown")).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "" } });
    expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
    expect(screen.getByText("Bob Brown")).toBeInTheDocument();
  });

  it("navigates to capture route when selecting a customer", async () => {
    renderScreen();
    const aliceRow = await screen.findByRole("button", { name: /alice johnson/i });

    fireEvent.click(aliceRow);

    expect(navigateMock).toHaveBeenCalledWith("/quotes/capture/cust-1");
  });

  it("switches to create mode when add button is clicked", async () => {
    renderScreen();
    await screen.findByText("Alice Johnson");

    fireEvent.click(screen.getByRole("button", { name: /add new customer/i }));

    expect(screen.getByRole("heading", { name: /add new customer/i })).toBeInTheDocument();
  });

  it("renders create form fields in create mode", async () => {
    renderScreen();
    await screen.findByText("Alice Johnson");

    fireEvent.click(screen.getByRole("button", { name: /add new customer/i }));

    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^phone$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^address$/i)).toBeInTheDocument();
  });

  it("submits create form and calls createCustomer with the right payload", async () => {
    renderScreen();
    await screen.findByText("Alice Johnson");

    fireEvent.click(screen.getByRole("button", { name: /add new customer/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "  New Customer  " },
    });
    fireEvent.change(screen.getByLabelText(/^phone$/i), {
      target: { value: "  555-0109 " },
    });
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: " new@example.com " },
    });
    fireEvent.change(screen.getByLabelText(/^address$/i), {
      target: { value: " 100 River Rd " },
    });
    fireEvent.click(screen.getByRole("button", { name: /create customer/i }));

    await waitFor(() => {
      expect(mockedCustomerService.createCustomer).toHaveBeenCalledWith({
        name: "New Customer",
        phone: "555-0109",
        email: "new@example.com",
        address: "100 River Rd",
      });
    });
  });

  it("navigates to capture route after successful create", async () => {
    renderScreen();
    await screen.findByText("Alice Johnson");

    fireEvent.click(screen.getByRole("button", { name: /add new customer/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "New Customer" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create customer/i }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/quotes/capture/cust-new");
    });
  });

  it("shows inline error if createCustomer rejects", async () => {
    mockedCustomerService.createCustomer.mockRejectedValueOnce(new Error("Unable to create customer"));
    renderScreen();
    await screen.findByText("Alice Johnson");

    fireEvent.click(screen.getByRole("button", { name: /add new customer/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "New Customer" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create customer/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to create customer");
  });

  it("returns to search mode when cancel is clicked in create mode", async () => {
    renderScreen();
    await screen.findByText("Alice Johnson");

    fireEvent.click(screen.getByRole("button", { name: /add new customer/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByRole("heading", { name: /select customer/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/search customers/i)).toBeInTheDocument();
  });
});
