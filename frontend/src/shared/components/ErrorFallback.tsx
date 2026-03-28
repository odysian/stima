import { Button } from "@/shared/components/Button";

export function ErrorFallback(): React.ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-on-background">
      <div
        role="alert"
        className="ghost-shadow w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-lowest p-8 text-center"
      >
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-error">
          Something went wrong
        </p>
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
