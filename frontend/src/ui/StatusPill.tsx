export type StatusPillVariant =
  | "draft"
  | "ready"
  | "shared"
  | "viewed"
  | "approved"
  | "declined"
  | "sent"
  | "paid"
  | "void";

interface StatusPillProps {
  variant: StatusPillVariant;
}

const styles: Record<StatusPillVariant, string> = {
  draft: "bg-neutral-container text-on-surface-variant",
  ready: "bg-success-container text-success",
  shared: "bg-info-container text-info",
  viewed: "bg-warning-container text-warning",
  approved: "bg-success-container text-success",
  declined: "bg-error-container text-error",
  sent: "bg-info-container text-info",
  paid: "bg-success-container text-success",
  void: "bg-neutral-container text-on-surface-variant line-through",
};

const labels: Record<StatusPillVariant, string> = {
  draft: "Draft",
  ready: "Ready",
  shared: "Shared",
  viewed: "Viewed",
  approved: "Approved",
  declined: "Declined",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

const pillBase = "text-[0.6875rem] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full";

export function StatusPill({ variant }: StatusPillProps): React.ReactElement {
  return (
    <span className={`${pillBase} ${styles[variant]}`}>
      {labels[variant]}
    </span>
  );
}
