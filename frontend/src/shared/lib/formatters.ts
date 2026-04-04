const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "\u2014";
  }

  return currencyFormatter.format(value);
}

export function formatDate(isoString: string, timezone?: string | null): string {
  const parsedDate = new Date(isoString);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Unknown date";
  }

  const resolvedTimezone = timezone ?? "UTC";

  try {
    return parsedDate.toLocaleDateString("en-US", {
      timeZone: resolvedTimezone,
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return parsedDate.toLocaleDateString("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
}

export function formatByteLimit(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  if (Number.isInteger(megabytes)) {
    return `${megabytes} MB`;
  }

  return `${megabytes.toFixed(1)} MB`;
}
