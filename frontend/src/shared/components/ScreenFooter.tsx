import type { ReactNode } from "react";

interface ScreenFooterProps {
  children: ReactNode;
}

export function ScreenFooter({ children }: ScreenFooterProps): React.ReactElement {
  return (
    <footer className="safe-bottom-keyboard glass-surface glass-shadow-bottom fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant/20 p-4 backdrop-blur-md">
      {children}
    </footer>
  );
}
