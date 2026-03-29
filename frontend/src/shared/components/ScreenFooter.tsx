import type { ReactNode } from "react";

interface ScreenFooterProps {
  children: ReactNode;
}

export function ScreenFooter({ children }: ScreenFooterProps): React.ReactElement {
  return (
    <footer className="fixed inset-x-0 bottom-0 z-40 bg-white/80 p-4 shadow-[0_-4px_24px_rgba(0,0,0,0.04)] backdrop-blur-md">
      {children}
    </footer>
  );
}
