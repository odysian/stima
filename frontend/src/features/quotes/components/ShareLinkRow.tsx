interface ShareLinkRowProps {
  shareUrl: string;
  onCopy: () => Promise<void>;
}

export function ShareLinkRow({
  shareUrl,
  onCopy,
}: ShareLinkRowProps): React.ReactElement {
  return (
    <section className="mx-4 mt-4 rounded-xl bg-surface-container-low p-3">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-3 ghost-shadow">
        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
            SHARE LINK
          </p>
          <p className="mt-2 truncate text-sm text-on-surface-variant">{shareUrl}</p>
        </div>
        <button
          type="button"
          className="rounded-lg p-2 transition-all hover:bg-surface-container active:scale-95"
          onClick={() => {
            void onCopy();
          }}
          aria-label="Copy share link"
        >
          <span className="material-symbols-outlined text-primary">content_copy</span>
        </button>
      </div>
    </section>
  );
}
