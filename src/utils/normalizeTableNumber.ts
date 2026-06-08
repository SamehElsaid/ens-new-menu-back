const TABLE_NUMBER_MAX = 50;
const TABLE_NUMBER_PATTERN =
  /^[a-zA-Z0-9\u0600-\u06FF][a-zA-Z0-9\u0600-\u06FF\s\-_]*$/;

/** Strip Arabic diacritics / tatweel that mobile keyboards may insert. */
export function normalizeTableNumber(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[^a-zA-Z0-9\u0600-\u06FF\s\-_]/g, "")
    .slice(0, TABLE_NUMBER_MAX);
}

export function isValidTableNumber(raw: unknown): boolean {
  const value = normalizeTableNumber(raw);
  return value.length > 0 && TABLE_NUMBER_PATTERN.test(value);
}
