interface StatusBadgeProps {
  variant: "draft" | "ready" | "shared" | "viewed" | "approved" | "declined";
}

const styles = {
  draft: "bg-neutral-container text-on-surface-variant",
  ready: "bg-success-container text-success",
  shared: "bg-info-container text-info",
  viewed: "bg-warning-container text-warning",
  approved: "bg-success-container text-success",
  declined: "bg-error-container text-error",
} as const;

const labels = {
  draft: "Draft",
  ready: "Ready",
  shared: "Shared",
  viewed: "Viewed",
  approved: "Approved",
  declined: "Declined",
} as const;

export function StatusBadge({ variant }: StatusBadgeProps): React.ReactElement {
  return (
    <span className={`text-[0.6875rem] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg ${styles[variant]}`}>
      {variant === "approved" ? (
        <span
          aria-hidden="true"
          className="material-symbols-outlined mr-1 align-[-0.15rem] text-sm"
        >
          check_circle
        </span>
      ) : null}
      {labels[variant]}
    </span>
  );
}
