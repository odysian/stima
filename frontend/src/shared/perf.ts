const DEV = import.meta.env.DEV;

export function perfMark(name: string): void {
  try {
    performance.mark(name);
  } catch {
    // Ignore unsupported or unavailable performance APIs.
  }
}

export function perfMeasure(
  name: string,
  startMark: string,
  endMark?: string,
): number {
  try {
    const entry = endMark
      ? performance.measure(name, startMark, endMark)
      : performance.measure(name, startMark);

    if (DEV) {
      console.debug(`[perf] ${name}: ${entry.duration.toFixed(1)}ms`);
    }

    return entry.duration;
  } catch {
    return 0;
  }
}
