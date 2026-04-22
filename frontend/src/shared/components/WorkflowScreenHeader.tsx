import type { ReactNode } from "react";

import { Button } from "@/shared/components/Button";
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
      <Button
        type="button"
        variant="iconButton"
        size="sm"
        onClick={onExitHome}
        aria-label={exitHomeLabel}
        className="border border-outline-variant/30 bg-surface-container-lowest text-on-surface ghost-shadow"
      >
        <span className="material-symbols-outlined block text-[1.125rem] leading-none">close</span>
      </Button>
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
