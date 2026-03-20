import type {
  Customer,
  CustomerCreateRequest,
  CustomerUpdateRequest,
} from "@/features/customers/types/customer.types";
import { request } from "@/shared/lib/http";

function listCustomers(): Promise<Customer[]> {
  return request<Customer[]>("/api/customers");
}

function createCustomer(data: CustomerCreateRequest): Promise<Customer> {
  return request<Customer>("/api/customers", {
    method: "POST",
    body: data,
  });
}

function getCustomer(id: string): Promise<Customer> {
  return request<Customer>(`/api/customers/${id}`);
}

function updateCustomer(id: string, data: CustomerUpdateRequest): Promise<Customer> {
  return request<Customer>(`/api/customers/${id}`, {
    method: "PATCH",
    body: data,
  });
}

export const customerService = {
  listCustomers,
  createCustomer,
  getCustomer,
  updateCustomer,
};
