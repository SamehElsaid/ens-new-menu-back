/** Pro yearly: checkout and display currency (not configurable via env). */
export const PRO_YEARLY_CURRENCY = "USD";

/**
 * Fallback when Plans.priceYearly for Pro is missing or invalid.
 * Prefer setting priceYearly via admin/plans — see resolveProYearlyAmount.
 *
 * Supports PRO_YEARLY_PRICE and legacy PRO_YEARLY_PRICE_EGP.
 */
function getProYearlyAmountEnvFallback(): number | null {
  for (const key of ["PRO_YEARLY_PRICE", "PRO_YEARLY_PRICE_EGP"]) {
    const raw = String(process.env[key] ?? "").trim();
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isNaN(n) && Number.isFinite(n) && n > 0) {
      return n;
    }
  }
  return null;
}

/**
 * Use admin-controlled Plans.priceYearly when it is valid (> 0).
 * Env is only used if the DB value is missing, zero or not a finite number (e.g. local/staging bootstrap).
 */
export function resolveProYearlyAmount(dbPriceYearly: number): number {
  const db = Number(dbPriceYearly);
  if (Number.isFinite(db) && db > 0) {
    return db;
  }
  const fallback = getProYearlyAmountEnvFallback();
  if (fallback != null) {
    return fallback;
  }
  return Number.isFinite(db) ? db : NaN;
}
