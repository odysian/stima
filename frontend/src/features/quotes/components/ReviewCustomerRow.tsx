import { Eyebrow } from "@/ui/Eyebrow";
import { AppIcon } from "@/ui/Icon";

interface ReviewCustomerRowProps {
  customerName: string | null;
  requiresCustomerAssignment: boolean;
  canReassignCustomer: boolean;
  isInteractionLocked: boolean;
  onRequestAssignment: () => void;
}

export function ReviewCustomerRow({
  customerName,
  requiresCustomerAssignment,
  canReassignCustomer,
  isInteractionLocked,
  onRequestAssignment,
}: ReviewCustomerRowProps): React.ReactElement {
  const isLocked = !requiresCustomerAssignment && !canReassignCustomer;
  const canOpenSheet = !isLocked && !isInteractionLocked;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>Customer</Eyebrow>
        {requiresCustomerAssignment ? (
          <Eyebrow as="span" className="rounded-full bg-warning-container px-2.5 py-1 text-warning">
            Needs customer
          </Eyebrow>
        ) : null}
      </div>

      <button
        type="button"
        className={`flex w-full cursor-pointer items-center justify-between rounded-[var(--radius-document)] border border-outline-variant/30 bg-surface-container-high px-4 py-3 text-left transition-all hover:bg-surface-container-lowest disabled:cursor-not-allowed disabled:opacity-70 ${
          requiresCustomerAssignment
            ? "ring-2 ring-warning-accent/60 animate-pulse [animation-iteration-count:3]"
            : ""
        }`}
        onClick={onRequestAssignment}
        disabled={!canOpenSheet}
      >
        <span className="font-semibold text-on-surface">
          {requiresCustomerAssignment ? "Customer: Unassigned" : customerName ?? "Assigned customer"}
        </span>
        {canOpenSheet ? (
          <AppIcon name="chevron_right" className="text-outline" />
        ) : null}
      </button>

      {isLocked ? (
        <p className="text-sm text-outline">
          Customer reassignment is locked after sharing or invoice conversion.
        </p>
      ) : null}
    </section>
  );
}
