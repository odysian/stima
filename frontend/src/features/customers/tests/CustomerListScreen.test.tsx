import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CustomerListScreen } from "@/features/customers/components/CustomerListScreen";
import { customerService } from "@/features/customers/services/customerService";
import type { Customer } from "@/features/customers/types/customer.types";

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

function renderScreen(): void {
  render(
    <MemoryRouter>
      <CustomerListScreen />
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

  it("renders empty-state card when there are no customers", async () => {
    mockedCustomerService.listCustomers.mockResolvedValueOnce([]);

    renderScreen();

    expect(await screen.findByText("No customers yet.")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "New customer" }));

    expect(navigateMock).toHaveBeenCalledWith("/customers/new");
  });

  it("renders BottomNav with customers tab active", async () => {
    mockedCustomerService.listCustomers.mockResolvedValueOnce([makeCustomer()]);

    renderScreen();
    await screen.findByText("Alice Johnson");

    expect(screen.getByRole("button", { name: /customers/i })).toHaveClass("text-primary");
  });
});
