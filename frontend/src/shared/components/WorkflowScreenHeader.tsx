import type { ReactNode } from "react";

import { ScreenHeader } from "@/shared/components/ScreenHeader";

interface WorkflowScreenHeaderProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  onBack: () => void;
  backLabel?: string;
  onExitHome?: () => void;
  exitHomeLabel?: string;
  trailing?: ReactNode;
}

export function WorkflowScreenHeader({
  title,
  eyebrow,
  subtitle,
  onBack,
  backLabel,
  onExitHome,
  exitHomeLabel = "Exit to home",
  trailing,
}: WorkflowScreenHeaderProps): React.ReactElement {
  const trailingContent = onExitHome ? (
    <div className="flex items-center gap-2">
      {trailing}
      <button
        type="button"
        onClick={onExitHome}
        aria-label={exitHomeLabel}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-outline-variant/30 bg-surface-container-lowest text-on-surface ghost-shadow transition-all hover:bg-surface-container-low active:scale-95"
      >
        <span className="material-symbols-outlined block text-[1.125rem] leading-none">close</span>
      </button>
    </div>
  ) : trailing;

  return (
    <ScreenHeader
      title={title}
      eyebrow={eyebrow}
      subtitle={subtitle}
      onBack={onBack}
      backLabel={backLabel}
      trailing={trailingContent}
    />
  );
}
