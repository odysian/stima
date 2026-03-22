interface StatusBadgeProps {
  variant: "draft" | "ready" | "shared";
}

const styles = {
  draft: "bg-slate-100 text-slate-600",
  ready: "bg-emerald-100 text-emerald-800",
  shared: "bg-sky-100 text-sky-800",
} as const;

const labels = {
  draft: "Draft",
  ready: "Ready",
  shared: "Shared",
} as const;

export function StatusBadge({ variant }: StatusBadgeProps): React.ReactElement {
  return (
    <span className={`text-[0.6875rem] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg ${styles[variant]}`}>
      {labels[variant]}
    </span>
  );
}
