import type { ReactElement } from "react";

import { Button } from "@/shared/components/Button";
import { Eyebrow } from "@/ui/Eyebrow";

export function ErrorFallback(): ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-on-background">
      <div
        role="alert"
        className="ghost-shadow w-full max-w-md rounded-[var(--radius-document)] border border-outline-variant/30 bg-surface-container-lowest p-8 text-center"
      >
        <Eyebrow className="text-error">Something went wrong</Eyebrow>
        <h1 className="mt-4 text-3xl font-semibold text-on-surface">Please reload Stima</h1>
        <p className="mt-3 text-sm leading-6 text-on-surface-variant">
          We hit an unexpected error and recorded it for follow-up. Reload to try again.
        </p>
        <Button className="mt-6 w-full" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </div>
  );
}
