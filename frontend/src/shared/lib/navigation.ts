export function canNavigateBack(): boolean {
  const historyState = window.history.state as { idx?: number } | null;
  if (typeof historyState?.idx === "number") {
    return historyState.idx > 0;
  }

  // This can step outside the app in rare direct-entry cases where the browser has
  // prior history but React Router did not set idx. We accept that tradeoff here to
  // preserve a sensible back behavior for older/non-router history state entries.
  return window.history.length > 1;
}
