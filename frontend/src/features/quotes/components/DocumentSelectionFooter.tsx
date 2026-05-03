import { useEffect, useRef, useState } from "react";

import { Button } from "@/shared/components/Button";
import { AppIcon } from "@/ui/Icon";

interface DocumentSelectionFooterProps {
  selectedCount: number;
  onCancelSelection: () => void;
  onArchiveSelection?: () => void;
  onDeleteSelectionPermanently?: () => void;
}

export function DocumentSelectionFooter({
  selectedCount,
  onCancelSelection,
  onArchiveSelection,
  onDeleteSelectionPermanently,
}: DocumentSelectionFooterProps): React.ReactElement {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMoreOpen) {
      return undefined;
    }

    function closeMenu(): void {
      setIsMoreOpen(false);
    }

    function onPointerDown(event: PointerEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isMoreOpen]);

  return (
    <footer className="fixed inset-x-0 bottom-[4.5rem] z-40 border-t border-outline-variant/20 glass-surface p-4 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
        <p className="text-sm font-semibold text-on-surface">{selectedCount} selected</p>

        {selectedCount === 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancelSelection}>
            Cancel
          </Button>
        ) : (
          <div ref={containerRef} className="relative flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onArchiveSelection}>
              Archive
            </Button>
            <Button
              type="button"
              variant="tonal"
              size="sm"
              aria-haspopup="menu"
              aria-expanded={isMoreOpen}
              onClick={() => setIsMoreOpen((current) => !current)}
            >
              More
            </Button>
            {isMoreOpen ? (
              <div
                role="menu"
                aria-label="More selection actions"
                className="absolute bottom-full right-0 mb-2 w-60 rounded-[var(--radius-document)] border border-outline-variant/50 bg-surface-container-low p-1.5 ghost-shadow"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="grid w-full cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-2.5 rounded-[var(--radius-document)] px-2.5 py-2.5 text-left text-sm font-medium text-error transition-colors hover:bg-surface-container-high focus-visible:bg-surface-container-high focus-visible:outline-none"
                  onClick={() => {
                    setIsMoreOpen(false);
                    onDeleteSelectionPermanently?.();
                  }}
                >
                  <AppIcon name="delete" className="block text-[1.125rem] leading-none" />
                  <span>Delete permanently...</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="grid w-full cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-2.5 rounded-[var(--radius-document)] px-2.5 py-2.5 text-left text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-high focus-visible:bg-surface-container-high focus-visible:outline-none"
                  onClick={() => {
                    setIsMoreOpen(false);
                    onCancelSelection();
                  }}
                >
                  <AppIcon name="close" className="block text-[1.125rem] leading-none" />
                  <span>Cancel selection</span>
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </footer>
  );
}
