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
    updateLineItem: vi.fn(),
    removeLineItem: vi.fn(),
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
  it("renders top app bar and search mode content", async () => {
    renderScreen();

    expect(screen.getByRole("heading", { name: "New Quote" })).toBeInTheDocument();
    expect(screen.getByText("Select a customer to continue")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add new customer/i })).toBeInTheDocument();
    expect(clearDraftMock).toHaveBeenCalledTimes(1);

    expect(await screen.findByText("Alice Johnson")).toBeInTheDocument();
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

  it("navigates to capture when selecting an existing customer", async () => {
    renderScreen();

    const customerButton = await screen.findByRole("button", { name: /alice johnson/i });
    fireEvent.click(customerButton);

    expect(navigateMock).toHaveBeenCalledWith("/quotes/capture/cust-1");
  });

  it("shows create mode with New Customer heading when CTA is clicked", async () => {
    renderScreen();
    await screen.findByText("Alice Johnson");

    fireEvent.click(screen.getByRole("button", { name: /add new customer/i }));

    expect(screen.getByRole("heading", { name: "New Customer" })).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create & continue >/i })).toBeInTheDocument();
  });

  it("submits create form and navigates to capture route", async () => {
    renderScreen();
    await screen.findByText("Alice Johnson");

    fireEvent.click(screen.getByRole("button", { name: /add new customer/i }));
    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "  New Customer  " },
    });
    fireEvent.change(screen.getByLabelText(/phone number/i), {
      target: { value: " 555-0109 " },
    });
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: " new@example.com " },
    });
    fireEvent.change(screen.getByLabelText(/^address$/i), {
      target: { value: " 100 River Rd " },
    });
    fireEvent.click(screen.getByRole("button", { name: /create & continue >/i }));

    await waitFor(() => {
      expect(mockedCustomerService.createCustomer).toHaveBeenCalledWith({
        name: "New Customer",
        phone: "555-0109",
        email: "new@example.com",
        address: "100 River Rd",
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/quotes/capture/cust-new");
  });

  it("shows inline error when create customer fails", async () => {
    mockedCustomerService.createCustomer.mockRejectedValueOnce(new Error("Unable to create customer"));
    renderScreen();
    await screen.findByText("Alice Johnson");

    fireEvent.click(screen.getByRole("button", { name: /add new customer/i }));
    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "New Customer" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create & continue >/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to create customer");
  });

  it("returns to search mode from create mode using back to search action", async () => {
    renderScreen();
    await screen.findByText("Alice Johnson");

    fireEvent.click(screen.getByRole("button", { name: /add new customer/i }));
    fireEvent.click(screen.getByRole("button", { name: /back to search/i }));

    expect(screen.getByRole("heading", { name: "New Quote" })).toBeInTheDocument();
    expect(screen.getByLabelText(/search customers/i)).toBeInTheDocument();
  });
});
