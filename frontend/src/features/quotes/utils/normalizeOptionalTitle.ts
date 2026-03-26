export function normalizeOptionalTitle(title: string): string | null {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : null;
}
