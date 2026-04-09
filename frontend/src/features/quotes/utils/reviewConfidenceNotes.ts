const REVIEW_CONFIDENCE_NOTES_PREFIX = "stima_review_confidence_notes";
const REVIEW_CONFIDENCE_DISMISS_PREFIX = "stima_review_confidence_dismiss";

function buildNotesStorageKey(quoteId: string): string {
  return `${REVIEW_CONFIDENCE_NOTES_PREFIX}:${quoteId}`;
}

function buildDismissStorageKey(quoteId: string): string {
  return `${REVIEW_CONFIDENCE_DISMISS_PREFIX}:${quoteId}`;
}

export function normalizeConfidenceNotes(notes: string[]): string[] {
  return [...new Set(notes.map((note) => note.trim()).filter((note) => note.length > 0))];
}

export function fingerprintConfidenceNotes(notes: string[]): string {
  return normalizeConfidenceNotes(notes).join("\n");
}

export function readQuoteConfidenceNotes(quoteId: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawValue = window.localStorage.getItem(buildNotesStorageKey(quoteId));
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return normalizeConfidenceNotes(parsed.filter((entry): entry is string => typeof entry === "string"));
  } catch {
    return [];
  }
}

export function writeQuoteConfidenceNotes(quoteId: string, notes: string[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    buildNotesStorageKey(quoteId),
    JSON.stringify(normalizeConfidenceNotes(notes)),
  );
}

export function readDismissedConfidenceFingerprint(quoteId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(buildDismissStorageKey(quoteId));
  return value && value.length > 0 ? value : null;
}

export function writeDismissedConfidenceFingerprint(quoteId: string, fingerprint: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(buildDismissStorageKey(quoteId), fingerprint);
}

