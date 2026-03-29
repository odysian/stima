import { useEffect, useId, useRef, useState } from "react";

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

    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

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
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-surface-container-low focus-visible:bg-surface-container-low focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        className="rounded-full border border-outline-variant/30 bg-surface-container-lowest p-2 text-on-surface ghost-shadow transition-all hover:bg-surface-container-low active:scale-95"
        onClick={() => {
          setIsOpen((current) => !current);
        }}
      >
        <span className="material-symbols-outlined text-[1.125rem]">more_horiz</span>
      </button>

      {isOpen ? (
        <div
          id={menuId}
          role="menu"
          aria-label={triggerLabel}
          className="absolute right-0 top-full z-50 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-2 ghost-shadow"
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
                  className={`${itemClassName} ${toneClassName} ${item.disabled ? "pointer-events-none opacity-40" : ""}`}
                  onClick={() => {
                    setIsOpen(false);
                    queueFocusRestore(triggerRef.current);
                    item.onSelect?.();
                  }}
                >
                  <span className="material-symbols-outlined text-[1.125rem]">{item.icon}</span>
                  <span>{item.label}</span>
                </a>
              );
            }

            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`${itemClassName} ${toneClassName}`}
                disabled={item.disabled}
                onClick={() => {
                  setIsOpen(false);
                  queueFocusRestore(triggerRef.current);
                  item.onSelect?.();
                }}
              >
                <span className="material-symbols-outlined text-[1.125rem]">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
