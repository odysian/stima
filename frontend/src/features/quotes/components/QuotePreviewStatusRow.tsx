import type { QuotePreviewStatusRowModel } from "@/features/quotes/components/quotePreview.helpers";

interface QuotePreviewStatusRowProps {
  row: QuotePreviewStatusRowModel;
}

export function QuotePreviewStatusRow({
  row,
}: QuotePreviewStatusRowProps): React.ReactElement {
  return (
    <section aria-label="Quote status" className="mx-4 mt-4 rounded-xl bg-surface-container-low p-3">
      <div className="ghost-shadow flex flex-wrap items-center gap-3 rounded-xl bg-surface-container-lowest p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${row.iconClasses}`}>
          <span className="material-symbols-outlined text-xl">{row.icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold text-on-surface">{row.text}</p>
            {row.timestamp ? (
              <time dateTime={row.timestampValue} className="text-sm text-on-surface-variant">
                {row.timestampLabel ? `${row.timestampLabel} ${row.timestamp}` : row.timestamp}
              </time>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
