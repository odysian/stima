import { useRegisterSW } from "virtual:pwa-register/react";

import { Button } from "@/shared/components/Button";

export function PwaUpdatePrompt(): React.ReactElement | null {
  const { needRefresh, updateServiceWorker } = useRegisterSW();

  if (!needRefresh[0]) {
    return null;
  }

  return (
    <aside className="pointer-events-none fixed inset-x-4 bottom-4 z-50 md:left-auto md:right-4 md:w-[22rem]">
      <div className="pointer-events-auto ghost-shadow rounded-[var(--radius-document)] border border-outline-variant bg-surface-container p-4">
        <p className="text-sm font-semibold text-on-surface">New version available.</p>
        <p className="mt-1 text-xs text-on-surface-variant">Reload to apply the latest offline shell updates.</p>
        <div className="mt-3 flex justify-end">
          <Button type="button" size="sm" onClick={() => void updateServiceWorker(true)}>
            Reload
          </Button>
        </div>
      </div>
    </aside>
  );
}
