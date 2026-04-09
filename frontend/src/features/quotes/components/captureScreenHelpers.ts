export const EXTRACTION_STAGE_DELAY_MS = 2500;
export const EXTRACTION_POLL_INTERVAL_MS = 2000;
export const EXTRACTION_MAX_POLLS = 60;

export function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export function getExtractionStages(hasClips: boolean, hasNotes: boolean): string[] {
  if (hasClips && hasNotes) {
    return ["Uploading audio...", "Transcribing audio...", "Extracting line items from audio and notes..."];
  }
  if (hasClips) {
    return ["Uploading audio...", "Transcribing audio...", "Extracting line items..."];
  }
  return ["Analyzing notes...", "Extracting line items..."];
}

export function getExtractionHelperCopy(hasClips: boolean, hasNotes: boolean): string | null {
  if (hasClips && hasNotes) {
    return "Extraction saves one draft from your recording and notes. You can capture more notes later from review.";
  }
  if (hasClips) {
    return "Extraction saves your recording as a draft checkpoint. You can capture more notes later from review.";
  }
  if (hasNotes) {
    return "Extraction saves your notes as a draft checkpoint. You can capture more notes later from review.";
  }
  return null;
}

export function getAppendHelperCopy(hasClips: boolean, hasNotes: boolean): string | null {
  if (hasClips && hasNotes) {
    return "Append mode merges these recordings and notes into your existing quote.";
  }
  if (hasClips) {
    return "Append mode merges these recordings into your existing quote.";
  }
  if (hasNotes) {
    return "Append mode merges these notes into your existing quote.";
  }
  return null;
}
