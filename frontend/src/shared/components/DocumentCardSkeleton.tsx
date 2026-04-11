import { SkeletonBlock } from "@/shared/components/SkeletonBlock";

export function DocumentCardSkeleton(): React.ReactElement {
  return (
    <div className="w-full rounded-xl bg-surface-container-lowest p-4 ghost-shadow">
      <div className="flex items-baseline justify-between gap-3">
        <SkeletonBlock width="52%" height="1rem" />
        <SkeletonBlock width="26%" height="1rem" />
      </div>
      <div className="mt-3 space-y-2">
        <SkeletonBlock width="64%" height="0.875rem" />
        <div className="flex items-center justify-between gap-3">
          <SkeletonBlock width="44%" height="0.875rem" />
          <SkeletonBlock width="30%" height="1.5rem" borderRadius="9999px" />
        </div>
      </div>
    </div>
  );
}