import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";

import { Button } from "@/shared/components/Button";
import { AppIcon } from "@/ui/Icon";

type SheetSize = "sm" | "md" | "lg" | "full";
type DataAttributes = { [key in `data-${string}`]?: string | number | boolean | undefined };

interface SheetProps extends Omit<Dialog.DialogProps, "children"> {
  children: ReactNode;
  size?: SheetSize;
  overlayProps?: Omit<React.ComponentPropsWithoutRef<typeof Dialog.Overlay>, "className">
    & { className?: string }
    & DataAttributes;
  contentProps?: Omit<React.ComponentPropsWithoutRef<typeof Dialog.Content>, "className" | "children"> & { className?: string };
  containerClassName?: string;
}

interface SheetRegionProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

interface SheetCloseButtonProps {
  className?: string;
  label?: string;
}

const sheetSizeClasses: Record<SheetSize, string> = {
  sm: "max-w-sm max-h-[70dvh]",
  md: "max-w-md max-h-[85dvh]",
  lg: "max-w-2xl max-h-[85dvh]",
  full: "h-[100dvh] max-w-none rounded-none md:max-w-4xl md:rounded-[var(--radius-document)]",
};

function joinClasses(...values: Array<string | null | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

export function Sheet({
  children,
  size = "md",
  overlayProps,
  contentProps,
  containerClassName,
  ...dialogProps
}: SheetProps): React.ReactElement {
  const restoreFocusTargetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (
      dialogProps.open
      && typeof document !== "undefined"
      && document.activeElement instanceof HTMLElement
    ) {
      restoreFocusTargetRef.current = document.activeElement;
    }
  }, [dialogProps.open]);

  const overlayClassName = joinClasses(
    "modal-backdrop fixed inset-0 z-50",
    overlayProps?.className,
  );
  const containerClass = joinClasses(
    "pointer-events-none fixed inset-0 z-50 flex items-end justify-center px-4 md:items-center",
    containerClassName,
  );
  const contentClassName = joinClasses(
    "pointer-events-auto w-full border border-outline-variant/20 glass-surface ghost-shadow backdrop-blur-md rounded-[var(--radius-document)] p-6 pb-[max(env(safe-area-inset-bottom),1.25rem)] outline-none overflow-y-auto md:pb-6",
    sheetSizeClasses[size],
    contentProps?.className,
  );
  const onCloseAutoFocus: Dialog.DialogContentProps["onCloseAutoFocus"] = (event) => {
    contentProps?.onCloseAutoFocus?.(event);
    if (event.defaultPrevented) {
      return;
    }
    if (restoreFocusTargetRef.current?.isConnected) {
      event.preventDefault();
      restoreFocusTargetRef.current.focus();
    }
  };

  return (
    <Dialog.Root {...dialogProps}>
      <Dialog.Portal>
        <Dialog.Overlay
          {...overlayProps}
          className={overlayClassName}
        />
        <div className={containerClass}>
          <Dialog.Content
            {...contentProps}
            className={contentClassName}
            onCloseAutoFocus={onCloseAutoFocus}
          >
            {children}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SheetHeader({ children, className }: SheetRegionProps): React.ReactElement {
  return (
    <div className={joinClasses("flex items-start justify-between gap-4", className)}>
      {children}
    </div>
  );
}

export function SheetBody({ children, className }: SheetRegionProps): React.ReactElement {
  return <div className={joinClasses("mt-4", className)}>{children}</div>;
}

export function SheetFooter({ children, className }: SheetRegionProps): React.ReactElement {
  return <div className={joinClasses("mt-6", className)}>{children}</div>;
}

export function SheetTitle({
  children,
  className,
}: SheetRegionProps): React.ReactElement {
  return (
    <Dialog.Title
      className={joinClasses(
        "font-headline text-xl font-bold tracking-tight text-on-surface",
        className,
      )}
    >
      {children}
    </Dialog.Title>
  );
}

export function SheetDescription({
  children,
  className,
  id,
}: SheetRegionProps): React.ReactElement {
  return (
    <Dialog.Description
      id={id}
      className={joinClasses("mt-2 text-sm leading-6 text-on-surface-variant", className)}
    >
      {children}
    </Dialog.Description>
  );
}

export function SheetCloseButton({
  className,
  label = "Close",
}: SheetCloseButtonProps): React.ReactElement {
  return (
    <Dialog.Close asChild>
      <Button
        type="button"
        variant="iconButton"
        size="xs"
        aria-label={label}
        className={joinClasses(
          "shrink-0 border border-outline-variant/30 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low",
          className,
        )}
      >
        <AppIcon name="close" className="text-base leading-none" />
      </Button>
    </Dialog.Close>
  );
}
