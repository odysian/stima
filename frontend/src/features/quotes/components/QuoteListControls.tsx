import { Button } from "@/shared/components/Button";
import { Input } from "@/shared/components/Input";
import { OverflowMenu } from "@/shared/components/OverflowMenu";
import { AppIcon } from "@/ui/Icon";

type DocumentMode = "quotes" | "invoices";

interface QuoteListControlsProps {
  documentMode: DocumentMode;
  isSelectionMode: boolean;
  isSearchOpen: boolean;
  searchQuery: string;
  searchLabel: string;
  searchPlaceholder: string;
  onDocumentModeChange: (mode: DocumentMode) => void;
  onSearchToggle: () => void;
  onSearchChange: (nextQuery: string) => void;
  onSearchClear: () => void;
  onEnterSelectionMode: () => void;
}

export function QuoteListControls({
  documentMode,
  isSelectionMode,
  isSearchOpen,
  searchQuery,
  searchLabel,
  searchPlaceholder,
  onDocumentModeChange,
  onSearchToggle,
  onSearchChange,
  onSearchClear,
  onEnterSelectionMode,
}: QuoteListControlsProps): React.ReactElement {
  return (
    <div className="mb-4 px-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div
          aria-label="Document type filter"
          className="inline-flex rounded-full bg-surface-container-low p-1"
        >
          <button
            type="button"
            aria-pressed={documentMode === "quotes"}
            disabled={isSelectionMode}
            className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition ${
              documentMode === "quotes"
                ? "ghost-shadow bg-surface-container-lowest text-primary ring-1 ring-selection-ring"
                : "text-on-surface-variant"
            } ${isSelectionMode ? "opacity-50" : ""}`}
            onClick={() => onDocumentModeChange("quotes")}
          >
            Quotes
          </button>
          <button
            type="button"
            aria-pressed={documentMode === "invoices"}
            disabled={isSelectionMode}
            className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition ${
              documentMode === "invoices"
                ? "ghost-shadow bg-surface-container-lowest text-primary ring-1 ring-selection-ring"
                : "text-on-surface-variant"
            } ${isSelectionMode ? "opacity-50" : ""}`}
            onClick={() => onDocumentModeChange("invoices")}
          >
            Invoices
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="iconButton"
            size="sm"
            aria-label={isSearchOpen ? "Close search" : "Open search"}
            className={isSearchOpen
              ? "border border-primary/70 bg-primary text-on-primary ghost-shadow hover:bg-primary/90"
              : "border border-outline-variant/30 bg-surface-container-lowest text-on-surface ghost-shadow"}
            onClick={onSearchToggle}
          >
            <AppIcon name="search" className="block text-[1.125rem] leading-none" />
          </Button>
          <OverflowMenu
            triggerLabel="List actions"
            items={[
              {
                label: "Select",
                icon: "check",
                onSelect: onEnterSelectionMode,
                disabled: isSelectionMode,
              },
            ]}
          />
        </div>
      </div>

      {isSearchOpen ? (
        <Input
          label={searchLabel}
          id="document-search"
          placeholder={searchPlaceholder}
          hideLabel
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          endAdornment={(
            <Button
              type="button"
              variant="iconButton"
              size="xs"
              aria-label="Clear search text"
              className="text-outline"
              onClick={onSearchClear}
            >
              <AppIcon name="close" className="block text-base leading-none" />
            </Button>
          )}
        />
      ) : null}
    </div>
  );
}
