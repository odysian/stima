import { useMemo, useState } from "react";

export type SelectionDocumentMode = "quotes" | "invoices";

interface UseDocumentSelectionArgs {
  activeMode: SelectionDocumentMode;
}

interface UseDocumentSelectionResult {
  isSelectionMode: boolean;
  selectedIds: string[];
  selectedCount: number;
  enterSelectionMode: () => void;
  cancelSelection: () => void;
  toggleSelection: (documentId: string) => void;
  isSelected: (documentId: string) => boolean;
}

export function useDocumentSelection({
  activeMode,
}: UseDocumentSelectionArgs): UseDocumentSelectionResult {
  const [selectionModeFor, setSelectionModeFor] = useState<SelectionDocumentMode | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const isSelectionMode = selectionModeFor === activeMode;

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function enterSelectionMode(): void {
    setSelectionModeFor(activeMode);
    setSelectedIds([]);
  }

  function cancelSelection(): void {
    setSelectionModeFor(null);
    setSelectedIds([]);
  }

  function toggleSelection(documentId: string): void {
    if (!isSelectionMode) {
      return;
    }
    setSelectedIds((current) => (
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId]
    ));
  }

  function isSelected(documentId: string): boolean {
    return selectedIdSet.has(documentId);
  }

  return {
    isSelectionMode,
    selectedIds,
    selectedCount: selectedIds.length,
    enterSelectionMode,
    cancelSelection,
    toggleSelection,
    isSelected,
  };
}
