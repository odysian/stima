interface SettingsCatalogShortcutCardProps {
  onOpenLineItemCatalog: () => void;
}

export function SettingsCatalogShortcutCard({
  onOpenLineItemCatalog,
}: SettingsCatalogShortcutCardProps): React.ReactElement {
  return (
    <section className="rounded-xl bg-surface-container-low p-4">
      <h2 className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
        Catalog
      </h2>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-sm text-on-surface-variant">
          Save and manage reusable line item presets.
        </p>
        <button
          type="button"
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-outline-variant/40 px-3 py-2 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
          onClick={onOpenLineItemCatalog}
        >
          Line Item Catalog
        </button>
      </div>
    </section>
  );
}
