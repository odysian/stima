import { useEffect, useId, useRef, useState } from "react";

import { AppIcon } from "@/ui/Icon";

export interface OverflowMenuItem {
  label: string;
  icon: string;
  onSelect?: () => void;
  href?: string;
  disabled?: boolean;
  tone?: "default" | "destructive";
  openInNewTab?: boolean;
}

interface OverflowMenuProps {
  items: OverflowMenuItem[];
  triggerLabel?: string;
}

function queueFocusRestore(target: HTMLButtonElement | null): void {
  queueMicrotask(() => {
    if (target?.isConnected) {
      target.focus();
    }
  });
}

export function OverflowMenu({
  items,
  triggerLabel = "More actions",
}: OverflowMenuProps): React.ReactElement | null {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const containerNode = containerRef.current;
    if (!containerNode) {
      return undefined;
    }
    const container: HTMLDivElement = containerNode;

    function handlePointerDown(event: PointerEvent): void {
      if (!container.contains(event.target as Node)) {
        setIsOpen(false);
        queueFocusRestore(triggerRef.current);
      }
    }

    function handleFocusOut(event: FocusEvent): void {
      const nextFocusedNode = event.relatedTarget;
      if (!nextFocusedNode || !container.contains(nextFocusedNode as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        queueFocusRestore(triggerRef.current);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    container.addEventListener("focusout", handleFocusOut);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      container.removeEventListener("focusout", handleFocusOut);
    };
  }, [isOpen]);

  if (items.length === 0) {
    return null;
  }

  const itemClassName =
    "grid w-full grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-2.5 rounded-[var(--radius-document)] px-2.5 py-2.5 text-left text-sm font-medium transition-colors hover:bg-surface-container-low focus-visible:bg-surface-container-low focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        className="inline-flex h-10 w-10 cursor-pointer shrink-0 items-center justify-center rounded-full border border-outline-variant/30 bg-surface-container-lowest text-on-surface ghost-shadow transition-all hover:bg-surface-container-low active:scale-95"
        onClick={() => {
          setIsOpen((current) => !current);
        }}
      >
        <AppIcon name="more_horiz" className="block text-[1.125rem] leading-none" />
      </button>

      {isOpen ? (
        <div
          id={menuId}
          role="menu"
          aria-label={triggerLabel}
          className="absolute right-0 top-full z-50 mt-2 w-52 max-w-[calc(100vw-2rem)] rounded-[var(--radius-document)] border border-outline-variant/50 bg-surface-container-low p-1.5 ghost-shadow"
        >
          {items.map((item) => {
            const toneClassName = item.tone === "destructive" ? "text-error" : "text-on-surface";

            if (item.href) {
              return (
                <a
                  key={item.label}
                  role="menuitem"
                  href={item.disabled ? undefined : item.href}
                  target={item.openInNewTab ? "_blank" : undefined}
                  rel={item.openInNewTab ? "noopener noreferrer" : undefined}
                  aria-disabled={item.disabled ? "true" : undefined}
                  className={`${itemClassName} ${toneClassName} ${item.disabled ? "pointer-events-none opacity-40" : "cursor-pointer"}`}
                  onClick={() => {
                    setIsOpen(false);
                    queueFocusRestore(triggerRef.current);
                    item.onSelect?.();
                  }}
                >
                  <AppIcon name={item.icon} className="block text-[1.125rem] leading-none" />
                  <span className="whitespace-nowrap leading-none">{item.label}</span>
                </a>
              );
            }

            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`${itemClassName} ${toneClassName} cursor-pointer`}
                disabled={item.disabled}
                onClick={() => {
                  setIsOpen(false);
                  queueFocusRestore(triggerRef.current);
                  item.onSelect?.();
                }}
              >
                <AppIcon name={item.icon} className="block text-[1.125rem] leading-none" />
                <span className="whitespace-nowrap leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
