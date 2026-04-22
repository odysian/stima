import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CustomerListScreen } from "@/features/customers/components/CustomerListScreen";
import { customerService } from "@/features/customers/services/customerService";
import type { Customer } from "@/features/customers/types/customer.types";
import { ToastProvider } from "@/ui/Toast";

const navigateMock = vi.fn();

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
    deleteCustomer: vi.fn(),
  },
}));

const mockedCustomerService = vi.mocked(customerService);

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "cust-1",
    name: "Alice Johnson",
    phone: "555-0101",
    email: "alice@example.com",
    address: null,
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
    ...overrides,
  };
}

function renderScreen(
  initialEntries: Array<string | { pathname: string; state?: unknown }> = ["/customers"],
): void {
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <ToastProvider>
        <CustomerListScreen />
      </ToastProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("CustomerListScreen", () => {
  it("renders customers title and customer rows from API data", async () => {
    mockedCustomerService.listCustomers.mockResolvedValueOnce([
      makeCustomer(),
      makeCustomer({
        id: "cust-2",
        name: "Bob Brown",
        phone: null,
        email: "bob@example.com",
      }),
    ]);

    renderScreen();

    expect(await screen.findByRole("heading", { name: "Customers" })).toBeInTheDocument();
    expect(screen.getByText("Stima")).toBeInTheDocument();
    expect(await screen.findByText("2 customers")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /alice johnson/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /bob brown/i })).toBeInTheDocument();
  });

  it("filters customer rows by name with case-insensitive search", async () => {
    mockedCustomerService.listCustomers.mockResolvedValueOnce([
      makeCustomer(),
      makeCustomer({
        id: "cust-2",
        name: "Bob Brown",
      }),
    ]);

    renderScreen();
    await screen.findByText("Alice Johnson");

    fireEvent.change(screen.getByLabelText("Search customers"), {
      target: { value: "bob" },
    });

    expect(screen.queryByText("Alice Johnson")).not.toBeInTheDocument();
    expect(screen.getByText("Bob Brown")).toBeInTheDocument();
  });

  it("uses a visually hidden label for the search input", async () => {
    mockedCustomerService.listCustomers.mockResolvedValueOnce([makeCustomer()]);

    renderScreen();

    await screen.findByText("Alice Johnson");
    expect(screen.getByText("Search customers", { selector: "label" })).toHaveClass("sr-only");
  });

  it("renders empty-state card when there are no customers", async () => {
    mockedCustomerService.listCustomers.mockResolvedValueOnce([]);

    renderScreen();

    expect(await screen.findByText("No customers yet.")).toBeInTheDocument();
    const icons = screen.getAllByText("group");
    expect(icons.some((icon) => icon.classList.contains("text-3xl"))).toBe(true);
  });

  it("renders the search-empty icon with the compact token size", async () => {
    mockedCustomerService.listCustomers.mockResolvedValueOnce([makeCustomer()]);

    renderScreen();
    await screen.findByText("Alice Johnson");

    fireEvent.change(screen.getByLabelText("Search customers"), {
      target: { value: "zzz" },
    });

    expect(await screen.findByText("No customers match your search.")).toBeInTheDocument();
    const icons = screen.getAllByText("group");
    expect(icons.some((icon) => icon.classList.contains("text-3xl"))).toBe(true);
  });

  it("navigates to customer detail when a row is clicked", async () => {
    mockedCustomerService.listCustomers.mockResolvedValueOnce([makeCustomer()]);

    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /alice johnson/i }));

    expect(navigateMock).toHaveBeenCalledWith("/customers/cust-1");
  });

  it("navigates to /customers/new when FAB is clicked", async () => {
    mockedCustomerService.listCustomers.mockResolvedValueOnce([makeCustomer()]);

    renderScreen();
    await screen.findByText("Alice Johnson");

    const newCustomerButton = screen.getByRole("button", { name: "New customer" });
    expect(newCustomerButton).toHaveClass("forest-gradient", "text-on-primary", "ghost-shadow");

    fireEvent.click(newCustomerButton);

    expect(navigateMock).toHaveBeenCalledWith("/customers/new");
  });

  it("renders BottomNav with customers tab active", async () => {
    mockedCustomerService.listCustomers.mockResolvedValueOnce([makeCustomer()]);

    renderScreen();
    await screen.findByText("Alice Johnson");

    expect(screen.getByRole("button", { name: /customers/i })).toHaveClass("text-primary");
  });

  it("does not show the customer count subtitle while the initial request is loading", async () => {
    let resolveCustomers: ((customers: Customer[]) => void) | undefined;
    const pendingRequest = new Promise<Customer[]>((resolve) => {
      resolveCustomers = resolve;
    });
    mockedCustomerService.listCustomers.mockReturnValueOnce(pendingRequest);

    renderScreen();

    expect(screen.queryByText(/^\d+\s+customers?$/i)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading customers...");

    resolveCustomers?.([makeCustomer()]);
    await waitFor(() => {
      expect(screen.queryByText("Loading customers...")).not.toBeInTheDocument();
    });
    expect(screen.getByText("1 customer")).toBeInTheDocument();
  });

  it("does not show the customer count subtitle when the initial request fails", async () => {
    mockedCustomerService.listCustomers.mockRejectedValueOnce(new Error("Unable to load customers"));

    renderScreen();

    expect(await screen.findByText("Unable to load customers")).toBeInTheDocument();
    expect(screen.queryByText("0 customers")).not.toBeInTheDocument();
  });

  it("renders success toast from navigation flash state", async () => {
    mockedCustomerService.listCustomers.mockResolvedValueOnce([makeCustomer()]);

    renderScreen([
      {
        pathname: "/customers",
        state: { flashMessage: "Customer deleted" },
      },
    ]);

    expect(await screen.findByRole("status")).toHaveTextContent("Customer deleted");
  });
});
