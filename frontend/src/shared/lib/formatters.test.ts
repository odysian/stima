import { describe, expect, it } from "vitest";

import { formatByteLimit, formatCurrency, formatDate } from "@/shared/lib/formatters";

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
  it("formats valid ISO dates in UTC when timezone is omitted", () => {
    expect(formatDate("2026-03-21T00:00:00.000Z")).toBe("Mar 21, 2026");
  });

  it("renders quote dates in the provided business timezone", () => {
    expect(formatDate("2026-03-25T00:00:00.000Z", "America/New_York")).toBe("Mar 24, 2026");
  });

  it("falls back to UTC when timezone is null", () => {
    expect(formatDate("2026-03-21T00:00:00.000Z", null)).toBe("Mar 21, 2026");
  });

  it("falls back to UTC when timezone is invalid", () => {
    expect(formatDate("2026-03-21T00:00:00.000Z", "Not/AZone")).toBe("Mar 21, 2026");
  });

  it("returns fallback for invalid dates", () => {
    expect(formatDate("not-a-date")).toBe("Unknown date");
  });
});

describe("formatByteLimit", () => {
  it("formats whole-megabyte limits without decimals", () => {
    expect(formatByteLimit(100 * 1024 * 1024)).toBe("100 MB");
  });

  it("formats fractional megabyte limits with one decimal place", () => {
    expect(formatByteLimit(1536 * 1024)).toBe("1.5 MB");
  });
});
