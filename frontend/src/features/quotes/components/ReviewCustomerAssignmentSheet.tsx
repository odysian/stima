import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

import { customerService } from "@/features/customers/services/customerService";
import type { Customer, CustomerCreateRequest } from "@/features/customers/types/customer.types";
import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Input } from "@/shared/components/Input";

interface ReviewCustomerAssignmentSheetProps {
  open: boolean;
  currentCustomerId: string | null;
  onClose: () => void;
  onAssignCustomer: (customerId: string) => Promise<void>;
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase();
}

function buildCustomerSearchLabel(customer: Customer): string {
  return [customer.name, customer.email, customer.phone]
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    .join(" ");
}

export function ReviewCustomerAssignmentSheet({
  open,
  currentCustomerId,
  onClose,
  onAssignCustomer,
}: ReviewCustomerAssignmentSheetProps): React.ReactElement {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [query, setQuery] = useState("");
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreateExpanded, setIsCreateExpanded] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    let isActive = true;

    async function fetchCustomers(): Promise<void> {
      setIsLoadingCustomers(true);
      setSheetError(null);
      try {
        const nextCustomers = await customerService.listCustomers();
        if (isActive) {
          setCustomers(nextCustomers);
        }
      } catch (error) {
        if (!isActive) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unable to load customers";
        setSheetError(message);
      } finally {
        if (isActive) {
          setIsLoadingCustomers(false);
        }
      }
    }

    void fetchCustomers();

    return () => {
      isActive = false;
    };
  }, [open]);

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(query);
    if (!normalizedQuery) {
      return customers;
    }

    return customers.filter((customer) =>
      buildCustomerSearchLabel(customer).toLowerCase().includes(normalizedQuery));
  }, [customers, query]);

  async function assignCustomer(customerId: string): Promise<void> {
    setSheetError(null);
    setIsSubmitting(true);
    try {
      await onAssignCustomer(customerId);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to assign customer";
      setSheetError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createAndAssignCustomer(): Promise<void> {
    const trimmedName = newCustomerName.trim();
    if (trimmedName.length === 0) {
      setSheetError("Customer name is required.");
      return;
    }

    const payload: CustomerCreateRequest = {
      name: trimmedName,
    };
    if (newCustomerPhone.trim().length > 0) {
      payload.phone = newCustomerPhone.trim();
    }
    if (newCustomerEmail.trim().length > 0) {
      payload.email = newCustomerEmail.trim();
    }

    setSheetError(null);
    setIsSubmitting(true);

    try {
      const createdCustomer = await customerService.createCustomer(payload);
      setCustomers((currentCustomers) => [createdCustomer, ...currentCustomers]);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewCustomerEmail("");
      setIsCreateExpanded(false);
      await onAssignCustomer(createdCustomer.id);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create customer";
      setSheetError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop fixed inset-0 z-50" />
        <div className="sheet-safe-bottom fixed inset-0 z-50 flex items-end justify-center px-4 sm:items-center">
          <Dialog.Content
            className="modal-shadow w-full max-w-md rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-lowest p-6"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <Dialog.Title className="font-headline text-xl font-bold tracking-tight text-on-surface">
              Assign Customer
            </Dialog.Title>

            <Dialog.Description className="mt-2 text-sm leading-6 text-on-surface-variant">
              Search existing customers or create one inline, then apply the assignment.
            </Dialog.Description>

            <div className="mt-4 space-y-4">
              {sheetError ? <FeedbackMessage variant="error">{sheetError}</FeedbackMessage> : null}

              <Input
                id="review-customer-search"
                label="Search customers"
                hideLabel
                placeholder="Search by name, email, or phone"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />

              {isLoadingCustomers ? (
                <p role="status" className="text-sm text-on-surface-variant">
                  Loading customers...
                </p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {filteredCustomers.length === 0 ? (
                    <p className="text-sm text-outline">No matching customers found.</p>
                  ) : (
                    filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        className="flex w-full cursor-pointer items-center justify-between rounded-lg bg-surface-container-low px-4 py-3 text-left transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isSubmitting}
                        onClick={() => void assignCustomer(customer.id)}
                      >
                        <span>
                          <span className="block font-semibold text-on-surface">{customer.name}</span>
                          <span className="block text-xs text-on-surface-variant">
                            {[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact details"}
                          </span>
                        </span>
                        {currentCustomerId === customer.id ? (
                          <span className="text-xs font-bold uppercase tracking-wide text-primary">Current</span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              )}

              <div className="rounded-lg bg-surface-container-low p-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="items-center gap-2 px-0"
                  disabled={isSubmitting}
                  onClick={() => setIsCreateExpanded((isExpanded) => !isExpanded)}
                >
                  <span className="material-symbols-outlined text-base">person_add</span>
                  {isCreateExpanded ? "Hide New Customer Form" : "Create New Customer"}
                </Button>

                {isCreateExpanded ? (
                  <div className="mt-3 space-y-3">
                    <Input
                      id="review-customer-new-name"
                      label="Customer name"
                      value={newCustomerName}
                      onChange={(event) => setNewCustomerName(event.target.value)}
                    />
                    <Input
                      id="review-customer-new-phone"
                      label="Phone number"
                      value={newCustomerPhone}
                      onChange={(event) => setNewCustomerPhone(event.target.value)}
                    />
                    <Input
                      id="review-customer-new-email"
                      label="Email address"
                      type="email"
                      value={newCustomerEmail}
                      onChange={(event) => setNewCustomerEmail(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      className="w-full"
                      disabled={isSubmitting}
                      onClick={() => void createAndAssignCustomer()}
                    >
                      Create and Assign
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
