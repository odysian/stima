interface ShareLinkRowProps {
  shareUrl: string;
  onCopy: () => Promise<void>;
}

export function ShareLinkRow({
  shareUrl,
  onCopy,
}: ShareLinkRowProps): React.ReactElement {
  return (
    <div className="mx-4 mt-4 flex items-center gap-3 rounded-lg bg-surface-container-low p-3">
      <span className="flex-1 truncate text-sm text-on-surface-variant">{shareUrl}</span>
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
  );
}
