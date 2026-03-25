const CURATED_TIMEZONE_OPTIONS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
] as const;

export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function detectBrowserTimezone(): string | null {
  const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!detectedTimezone || !isValidTimezone(detectedTimezone)) {
    return null;
  }

  return detectedTimezone;
}

export function getTimezoneOptions(selectedTimezone?: string | null): string[] {
  const options: string[] = [...CURATED_TIMEZONE_OPTIONS];

  if (
    selectedTimezone &&
    isValidTimezone(selectedTimezone) &&
    !options.some((option) => option === selectedTimezone)
  ) {
    options.unshift(selectedTimezone);
  }

  return options;
}
