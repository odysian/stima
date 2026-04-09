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
    <section className="space-y-2 rounded-xl bg-surface-container-low p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">Customer</p>
        {requiresCustomerAssignment ? (
          <span className="rounded-lg bg-warning-container px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-wide text-warning">
            Needs customer
          </span>
        ) : null}
      </div>

      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between rounded-lg bg-surface-container-lowest px-4 py-3 text-left ghost-shadow disabled:cursor-not-allowed disabled:opacity-70"
        onClick={onRequestAssignment}
        disabled={!canOpenSheet}
      >
        <span className="font-semibold text-on-surface">
          {requiresCustomerAssignment ? "Customer: Unassigned" : customerName ?? "Assigned customer"}
        </span>
        {canOpenSheet ? (
          <span className="material-symbols-outlined text-outline">chevron_right</span>
        ) : null}
      </button>

      {requiresCustomerAssignment ? (
        <p className="text-sm text-warning">
          Assign a customer before continuing to preview or sending quote output.
        </p>
      ) : null}

      {isLocked ? (
        <p className="text-sm text-outline">
          Customer reassignment is locked after sharing or invoice conversion.
        </p>
      ) : null}
    </section>
  );
}

