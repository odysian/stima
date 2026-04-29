import type { Customer } from "@/features/customers/types/customer.types";
import { Button } from "@/shared/components/Button";
import { Eyebrow } from "@/ui/Eyebrow";

interface CustomerSummaryCardProps {
  customer: Customer;
  preferredAddress: string | null;
  onCreateDocument: () => void;
  onEdit: () => void;
}

function formatSummaryValue(value: string | null | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const trimmedValue = value.trim();
  return trimmedValue || fallback;
}

export function CustomerSummaryCard({
  customer,
  preferredAddress,
  onCreateDocument,
  onEdit,
}: CustomerSummaryCardProps): React.ReactElement {
  return (
    <section className="rounded-[var(--radius-document)] bg-surface-container-lowest p-4 ghost-shadow">
      <div className="flex flex-col gap-3">
        <dl className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <dt className="w-16 shrink-0">
              <Eyebrow>Phone</Eyebrow>
            </dt>
            <dd className="text-sm text-on-surface">
              {formatSummaryValue(customer.phone, "—")}
            </dd>
          </div>
          <div className="flex items-center gap-3">
            <dt className="w-16 shrink-0">
              <Eyebrow>Email</Eyebrow>
            </dt>
            <dd className="min-w-0 truncate text-sm text-on-surface">
              {formatSummaryValue(customer.email, "—")}
            </dd>
          </div>
          <div className="flex items-start gap-3">
            <dt className="w-16 shrink-0 pt-0.5">
              <Eyebrow>Address</Eyebrow>
            </dt>
            <dd className="whitespace-pre-wrap text-sm text-on-surface">
              {formatSummaryValue(preferredAddress, "—")}
            </dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2 pt-1">
          <Button type="button" variant="primary" className="w-full" onClick={onCreateDocument}>
            Create Document
          </Button>
          <Button type="button" variant="secondary" className="w-full" onClick={onEdit}>
            Edit
          </Button>
        </div>
      </div>
    </section>
  );
}
