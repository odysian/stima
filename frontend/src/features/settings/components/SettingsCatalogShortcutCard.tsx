import { Button } from "@/shared/components/Button";
import { Card } from "@/ui/Card";
import { Eyebrow } from "@/ui/Eyebrow";

interface SettingsCatalogShortcutCardProps {
  onOpenLineItemCatalog: () => void;
}

export function SettingsCatalogShortcutCard({
  onOpenLineItemCatalog,
}: SettingsCatalogShortcutCardProps): React.ReactElement {
  return (
    <Card className="bg-surface-container-low p-4">
      <Eyebrow>Catalog</Eyebrow>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-sm text-on-surface-variant">
          Save and manage reusable line item presets.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="px-3 py-2 text-xs"
          onClick={onOpenLineItemCatalog}
        >
          Line Item Catalog
        </Button>
      </div>
    </Card>
  );
}
