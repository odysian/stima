import type { ReactNode } from "react";

import { Card } from "@/ui/Card";

interface EmptyStateProps {
  icon?: string;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  tone?: "neutral" | "attention";
  className?: string;
}

/**
 * Empty state icon inventory:
 * - `description` for quote/invoice document lists.
 * - `group` for customer list surfaces.
 * - `description` for customer document history.
 * - `folder_off` for line item catalog.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  tone = "neutral",
  className,
}: EmptyStateProps): React.ReactElement {
  const toneClass = tone === "attention" ? "bg-warning-container/40" : "bg-surface-container-lowest";

  return (
    <Card className={["text-center", toneClass, className].filter(Boolean).join(" ")}>
      <div className="flex flex-col items-center">
        {icon ? (
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high">
            <span className="material-symbols-outlined text-3xl text-outline">{icon}</span>
          </div>
        ) : null}
        <h3 className="text-base font-semibold text-on-surface">{title}</h3>
        {body ? <div className="mt-1 text-sm text-outline">{body}</div> : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </Card>
  );
}
