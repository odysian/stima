import type { ReactNode } from "react";

interface ScreenFooterProps {
  children: ReactNode;
}

export function ScreenFooter({ children }: ScreenFooterProps): React.ReactElement {
  return (
    <footer className="fixed bottom-0 z-40 w-full bg-white/80 backdrop-blur-md p-4 shadow-[0_-4px_24px_rgba(0,0,0,0.04)]">
      {children}
    </footer>
  );
}
