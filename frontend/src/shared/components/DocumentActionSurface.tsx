import type { ReactNode } from "react";

import { FeedbackMessage } from "@/shared/components/FeedbackMessage";

const utilityGridClassNames = {
  1: "grid grid-cols-1 gap-2",
  2: "grid grid-cols-2 items-stretch gap-2",
} as const;

export const documentActionPrimaryLinkClassName = "forest-gradient inline-flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-document)] px-4 py-4 text-center font-semibold text-on-primary transition-all active:scale-[0.98]";

interface DocumentActionSurfaceProps {
  sectionLabel: string;
  primaryAction: ReactNode;
  utilityActions?: ReactNode;
  utilityLabel?: string;
  utilityColumns?: 1 | 2;
  hint?: ReactNode;
  status?: ReactNode;
  feedback?: ReactNode;
}

interface MessageProps {
  children: ReactNode;
}

interface ManualCopyFieldProps {
  url: string;
  label?: string;
}

export function DocumentActionSurface({
  sectionLabel,
  primaryAction,
  utilityActions,
  utilityLabel,
  utilityColumns = 2,
  hint,
  status,
  feedback,
}: DocumentActionSurfaceProps): React.ReactElement {
  const shouldRenderUtilities = utilityActions !== null && utilityActions !== undefined;
  const utilityAccessibilityProps = utilityLabel ? { "aria-label": utilityLabel } : {};

  return (
    <>
      <section className="mt-4 px-4" aria-label={sectionLabel}>
        <div className="ghost-shadow rounded-[var(--radius-document)] border border-outline-variant/30 bg-surface-container-lowest p-4">
          {primaryAction}

          {shouldRenderUtilities ? (
            <div
              role="group"
              {...utilityAccessibilityProps}
              className={`mt-3 ${utilityGridClassNames[utilityColumns]}`}
            >
              {utilityActions}
            </div>
          ) : null}
        </div>
      </section>

      {hint}
      {status}
      {feedback}
    </>
  );
}

export function DocumentActionHint({ children }: MessageProps): React.ReactElement {
  return <p className="mx-4 mt-3 text-sm text-on-surface-variant">{children}</p>;
}

export function DocumentActionStatus({ children }: MessageProps): React.ReactElement {
  return (
    <p role="status" className="mx-4 mt-3 text-sm text-on-surface-variant">
      {children}
    </p>
  );
}

export function DocumentActionError({ children }: MessageProps): React.ReactElement {
  return (
    <div className="mx-4 mt-3">
      <FeedbackMessage variant="error">{children}</FeedbackMessage>
    </div>
  );
}

export function DocumentActionSuccessMessage({ children }: MessageProps): React.ReactElement {
  return (
    <p className="mx-4 mt-3 rounded-md bg-success-container p-3 text-sm text-success">
      {children}
    </p>
  );
}

export function DocumentActionManualCopyField({
  url,
  label = "Share URL",
}: ManualCopyFieldProps): React.ReactElement {
  return (
    <div className="mx-4 mt-3">
      <label className="block text-sm font-medium text-on-surface" htmlFor="manual-share-url">
        {label}
      </label>
      <input
        id="manual-share-url"
        type="text"
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
        className="mt-2 w-full rounded-lg border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}
