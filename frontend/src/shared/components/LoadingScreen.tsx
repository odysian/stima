export function LoadingScreen(): React.ReactElement {
  return (
    <main className="screen-radial-backdrop flex min-h-screen items-center justify-center px-6 py-10 text-on-surface">
      <div className="glass-surface-strong ghost-shadow w-full max-w-xs rounded-xl border border-outline-variant/50 px-8 py-9 text-center">
        <p className="font-headline text-3xl font-bold tracking-tight text-primary">Stima</p>
        <div role="status" aria-label="Loading app" aria-live="polite" className="mt-6 flex flex-col items-center gap-3">
          <span className="relative flex h-12 w-12 items-center justify-center">
            <span className="absolute inset-0 animate-spin [animation-duration:1.1s]">
              <span className="absolute left-1/2 top-0.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-primary" />
              <span className="absolute bottom-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-primary/65" />
            </span>
          </span>
          <p className="text-sm text-on-surface-variant">Preparing your workspace...</p>
        </div>
      </div>
    </main>
  );
}
