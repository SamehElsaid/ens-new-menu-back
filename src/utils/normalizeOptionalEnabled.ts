/** Optional features default OFF — only explicit true/1 enables. */
export function normalizeOptionalEnabled(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return false;
}

export function normalizePercent(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}
