import { Eyebrow } from "@/ui/Eyebrow";
import { QuoteListRow } from "@/ui/QuoteListRow";
import type { StatusPillVariant } from "@/ui/StatusPill";

export interface DocumentRow {
  id: string;
  doc_type: "quote" | "invoice";
  customerLabel: string;
  titleLabel?: string | null;
  docAndDate: string;
  totalAmount: number | null;
  status: StatusPillVariant;
  destination: string;
  destinationState?: {
    origin: "list";
  };
  isDraft?: boolean;
  needsCustomerAssignment?: boolean;
}

interface DocumentRowsSectionProps {
  label: string;
  rows: DocumentRow[];
  onRowClick: (row: DocumentRow) => void;
  isSelectionMode?: boolean;
  isSelected?: (row: DocumentRow) => boolean;
}

export function DocumentRowsSection({
  label,
  rows,
  onRowClick,
  isSelectionMode = false,
  isSelected,
}: DocumentRowsSectionProps): React.ReactElement {
  return (
    <section aria-label={label}>
      <div className="mb-2 px-4">
        <Eyebrow>{label}</Eyebrow>
      </div>
      <div className="mx-4 rounded-[var(--radius-document)] bg-surface-container-low p-3">
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id}>
              <QuoteListRow
                customerLabel={row.customerLabel}
                titleLabel={row.titleLabel}
                docAndDate={row.docAndDate}
                totalAmount={row.totalAmount}
                status={row.status}
                isDraft={row.isDraft}
                needsCustomerAssignment={row.needsCustomerAssignment}
                isSelectionMode={isSelectionMode}
                isSelected={isSelected?.(row)}
                onClick={() => onRowClick(row)}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
