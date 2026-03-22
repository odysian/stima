import { describe, expect, it } from "vitest";

import { formatCurrency, formatDate } from "@/shared/lib/formatters";

describe("formatCurrency", () => {
  it("formats integer values in USD", () => {
    expect(formatCurrency(120)).toBe("$120.00");
  });

  it("formats decimal values in USD", () => {
    expect(formatCurrency(245.5)).toBe("$245.50");
  });

  it("formats zero in USD", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("returns fallback for null-like or invalid values", () => {
    expect(formatCurrency(null)).toBe("\u2014");
    expect(formatCurrency(undefined)).toBe("\u2014");
    expect(formatCurrency(Number.NaN)).toBe("\u2014");
  });
});

describe("formatDate", () => {
  it("formats valid ISO dates in UTC", () => {
    expect(formatDate("2026-03-21T00:00:00.000Z")).toBe("Mar 21, 2026");
  });

  it("applies timezone conversion before rendering", () => {
    expect(formatDate("2026-03-21T23:30:00-05:00")).toBe("Mar 22, 2026");
  });

  it("returns fallback for invalid dates", () => {
    expect(formatDate("not-a-date")).toBe("Unknown date");
  });
});
