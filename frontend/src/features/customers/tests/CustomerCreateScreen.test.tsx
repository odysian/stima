import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CustomerCreateScreen } from "@/features/customers/components/CustomerCreateScreen";
import { customerService } from "@/features/customers/services/customerService";
import {
  ADDRESS_CITY_MAX_CHARS,
  ADDRESS_LINE_MAX_CHARS,
  ADDRESS_POSTAL_CODE_MAX_CHARS,
  PHONE_NUMBER_MAX_CHARS,
} from "@/shared/lib/inputLimits";

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

function renderScreen(): void {
  render(
    <MemoryRouter>
      <CustomerCreateScreen />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("CustomerCreateScreen", () => {
  it("renders create form fields", () => {
    renderScreen();

    expect(screen.getByRole("heading", { name: /new customer/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone number/i)).toHaveAttribute(
      "maxLength",
      PHONE_NUMBER_MAX_CHARS.toString(),
    );
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByText(/^address$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/street address or p\.o\. box/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/street address or p\.o\. box/i)).toHaveAttribute(
      "maxLength",
      ADDRESS_LINE_MAX_CHARS.toString(),
    );
    expect(screen.getByPlaceholderText(/street address or p\.o\. box/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/apt, suite, unit, building \(optional\)/i)).toHaveAttribute(
      "maxLength",
      ADDRESS_LINE_MAX_CHARS.toString(),
    );
    expect(screen.getByPlaceholderText(/apt, suite, unit, building \(optional\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^city$/i)).toHaveAttribute(
      "maxLength",
      ADDRESS_CITY_MAX_CHARS.toString(),
    );
    expect(screen.getByLabelText(/^state$/i)).toHaveValue("");
    expect(screen.getByRole("option", { name: "Select" })).toHaveValue("");
    expect(screen.getByLabelText(/zip code/i)).toHaveAttribute(
      "maxLength",
      ADDRESS_POSTAL_CODE_MAX_CHARS.toString(),
    );
    expect(screen.getByPlaceholderText(/zip code/i)).toBeInTheDocument();
    expect(screen.queryByText(/postal code/i)).not.toBeInTheDocument();
  });

  it("shows validation error when submitted with empty name", async () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: /create customer/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Name is required");
    expect(mockedCustomerService.createCustomer).not.toHaveBeenCalled();
  });

  it("creates customer and navigates to detail route", async () => {
    mockedCustomerService.createCustomer.mockResolvedValueOnce({
      id: "cust-new",
      name: "New Customer",
      phone: "555-0109",
      email: "new@example.com",
      address: "100 River Rd",
      address_line1: "100 River Rd",
      address_line2: null,
      city: null,
      state: null,
      postal_code: null,
      formatted_address: "100 River Rd",
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:00:00.000Z",
    });

    renderScreen();

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "  New Customer  " },
    });
    fireEvent.change(screen.getByLabelText(/phone number/i), {
      target: { value: " 555-0109 " },
    });
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: " new@example.com " },
    });
    fireEvent.change(screen.getByLabelText(/street address or p\.o\. box/i), {
      target: { value: " 100 River Rd " },
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

    fireEvent.click(screen.getByRole("button", { name: /create customer/i }));

    await waitFor(() => {
      expect(mockedCustomerService.createCustomer).toHaveBeenCalledWith({
        name: "New Customer",
        phone: "555-0109",
        email: "new@example.com",
        address_line1: "100 River Rd",
        city: "Denver",
        state: "OH",
        postal_code: "80210",
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/customers/cust-new");
  });

  it("shows API error banner when create request fails", async () => {
    mockedCustomerService.createCustomer.mockRejectedValueOnce(new Error("Unable to create customer"));

    renderScreen();

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "New Customer" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create customer/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to create customer");
  });
});
