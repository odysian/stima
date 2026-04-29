// These values mirror backend/app/shared/input_limits.py.
// They are duplicated intentionally because frontend and backend do not share a build artifact.
// If a backend limit changes, update the corresponding constant here as a manual contract sync.
export const NOTE_INPUT_MAX_CHARS = 50_000;
export const AUDIO_TRANSCRIPT_MAX_CHARS = 100_000;
export const EXTRACTION_TRANSCRIPT_MAX_CHARS = AUDIO_TRANSCRIPT_MAX_CHARS + NOTE_INPUT_MAX_CHARS + 2;
export const DOCUMENT_TRANSCRIPT_MAX_CHARS = 100_000;
export const CUSTOMER_ADDRESS_MAX_CHARS = 500;
export const PHONE_NUMBER_MAX_CHARS = 30;
export const ADDRESS_LINE_MAX_CHARS = 255;
export const ADDRESS_CITY_MAX_CHARS = 100;
export const ADDRESS_STATE_MAX_CHARS = 64;
export const ADDRESS_POSTAL_CODE_MAX_CHARS = 20;
export const LINE_ITEM_DESCRIPTION_MAX_CHARS = 500;
export const LINE_ITEM_DETAILS_MAX_CHARS = 2_000;
export const DOCUMENT_NOTES_MAX_CHARS = 5_000;
export const DOCUMENT_LINE_ITEMS_MAX_ITEMS = 50;
export const MAX_AUDIO_CLIPS_PER_REQUEST = 10;
export const MAX_AUDIO_TOTAL_BYTES = 100 * 1024 * 1024;
export const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
