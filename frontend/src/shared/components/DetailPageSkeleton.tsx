import { SkeletonBlock } from "@/shared/components/SkeletonBlock";

interface DetailPageSkeletonProps {
  className?: string;
}

export function DetailPageSkeleton({ className }: DetailPageSkeletonProps): React.ReactElement {
  return (
    <div className={`space-y-4 ${className ?? ""}`.trim()}>
      <div className="rounded-[var(--radius-document)] bg-surface-container-lowest p-4 ghost-shadow">
        <div className="flex items-center justify-between gap-3">
          <SkeletonBlock width="48%" height="1.5rem" />
          <SkeletonBlock width="28%" height="1.5rem" borderRadius="9999px" />
        </div>
        <SkeletonBlock className="mt-3" width="36%" height="0.875rem" />
      </div>

      <div className="space-y-3 rounded-[var(--radius-document)] bg-surface-container-low p-4">
        <SkeletonBlock width="100%" height="4.5rem" />
        <SkeletonBlock width="100%" height="4.5rem" />
        <SkeletonBlock width="100%" height="4.5rem" />
      </div>
    </div>
  );
}
