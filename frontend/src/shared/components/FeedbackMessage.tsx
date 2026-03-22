import type { ReactNode } from "react";

interface FeedbackMessageProps {
  variant: "error";
  children: ReactNode;
}

const variantClasses: Record<FeedbackMessageProps["variant"], string> = {
  error: "border-l-4 border-error bg-error-container text-error",
};

export function FeedbackMessage({
  variant,
  children,
}: FeedbackMessageProps): React.ReactElement {
  return (
    <p role="alert" className={`rounded-lg p-4 text-sm ${variantClasses[variant]}`}>
      {children}
    </p>
  );
}
