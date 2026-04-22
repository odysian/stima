import { SkeletonBlock } from "@/shared/components/SkeletonBlock";

export function CustomerDetailLoadingSkeleton(): React.ReactElement {
  return (
    <>
      <section className="rounded-[var(--radius-document)] bg-surface-container-lowest p-4 ghost-shadow">
        <div className="space-y-3">
          <SkeletonBlock width="45%" height="1rem" />
          <SkeletonBlock width="72%" height="1rem" />
          <SkeletonBlock width="68%" height="1rem" />
        </div>
      </section>
      <section className="rounded-[var(--radius-document)] bg-surface-container-low p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <SkeletonBlock width="48%" height="2.25rem" borderRadius="9999px" />
          <SkeletonBlock width="20%" height="0.875rem" />
        </div>
        <div className="space-y-3">
          <SkeletonBlock width="100%" height="4.25rem" />
          <SkeletonBlock width="100%" height="4.25rem" />
        </div>
      </section>
    </>
  );
}
