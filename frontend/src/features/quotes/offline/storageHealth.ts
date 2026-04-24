export type StorageEstimate = {
  usedBytes: number | null;
  quotaBytes: number | null;
  percentUsed: number | null;
};

const DEFAULT_PRESSURE_THRESHOLD_PERCENT = 85;

export async function getStorageEstimate(): Promise<StorageEstimate> {
  if (
    typeof navigator === "undefined" ||
    !navigator.storage ||
    typeof navigator.storage.estimate !== "function"
  ) {
    return {
      usedBytes: null,
      quotaBytes: null,
      percentUsed: null,
    };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usedBytes = typeof estimate.usage === "number" ? estimate.usage : null;
    const quotaBytes = typeof estimate.quota === "number" ? estimate.quota : null;

    const percentUsed =
      usedBytes !== null && quotaBytes !== null && quotaBytes > 0
        ? (usedBytes / quotaBytes) * 100
        : null;

    return {
      usedBytes,
      quotaBytes,
      percentUsed,
    };
  } catch {
    return {
      usedBytes: null,
      quotaBytes: null,
      percentUsed: null,
    };
  }
}

export async function isStoragePressured(
  thresholdPercent: number = DEFAULT_PRESSURE_THRESHOLD_PERCENT,
): Promise<boolean> {
  const { percentUsed } = await getStorageEstimate();
  return percentUsed !== null && percentUsed >= thresholdPercent;
}
