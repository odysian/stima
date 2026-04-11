interface StatusBadgeProps {
  variant: "draft" | "ready" | "shared" | "viewed" | "approved" | "declined" | "sent" | "paid" | "void";
}

export const statusBadgeBaseClasses = "text-[0.6875rem] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg";

const styles = {
  draft: "bg-neutral-container text-on-surface-variant",
  ready: "bg-success-container text-success",
  shared: "bg-info-container text-info",
  viewed: "bg-warning-container text-warning",
  approved: "bg-success-container text-success",
  declined: "bg-error-container text-error",
  sent: "bg-info-container text-info",
  paid: "bg-success-container text-success",
  void: "bg-neutral-container text-on-surface-variant line-through",
} as const;

const labels = {
  draft: "Draft",
  ready: "Ready",
  shared: "Shared",
  viewed: "Viewed",
  approved: "Approved",
  declined: "Declined",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
} as const;

export function StatusBadge({ variant }: StatusBadgeProps): React.ReactElement {
  return (
    <span className={`${statusBadgeBaseClasses} ${styles[variant]}`}>
      {labels[variant]}
    </span>
  );
}
