interface CardProps {
  children: React.ReactNode;
  accent?: "warn" | "primary";
  className?: string;
}

export function Card({ children, accent, className }: CardProps): React.ReactElement {
  const accentClass =
    accent === "primary"
      ? "border-l-4 border-primary"
      : accent === "warn"
        ? "border-l-4 border-warning-accent"
        : "";

  return (
    <div
      className={[
        "rounded-[var(--radius-document)] bg-surface-container-lowest ghost-shadow p-4",
        accentClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
