import sql from "mssql";
import type { ConnectionPool } from "mssql";

/** Pro subscription checkout and display currency */
export const PRO_YEARLY_CURRENCY = "EGP";

export const PRO_DEFAULT_PRICE_MONTHLY = 499;
export const PRO_DEFAULT_PRICE_YEARLY = 5988;

function parseEnvPrice(key: string): number | null {
  const raw = String(process.env[key] ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isNaN(n) && Number.isFinite(n) && n > 0) {
    return n;
  }
  return null;
}

function getProMonthlyAmountEnvFallback(): number | null {
  return (
    parseEnvPrice("PRO_MONTHLY_PRICE") ??
    parseEnvPrice("PRO_MONTHLY_PRICE_EGP")
  );
}

/**
 * Fallback when Plans.priceYearly for Pro is missing or invalid.
 * Supports PRO_YEARLY_PRICE and legacy PRO_YEARLY_PRICE_EGP.
 */
function getProYearlyAmountEnvFallback(): number | null {
  for (const key of ["PRO_YEARLY_PRICE", "PRO_YEARLY_PRICE_EGP"]) {
    const n = parseEnvPrice(key);
    if (n != null) return n;
  }
  return null;
}

/**
 * Use admin-controlled Plans.priceMonthly when it is valid (> 0).
 */
export function resolveProMonthlyAmount(dbPriceMonthly: number): number {
  const db = Number(dbPriceMonthly);
  if (Number.isFinite(db) && db > 0) {
    return db;
  }
  const fallback = getProMonthlyAmountEnvFallback();
  if (fallback != null) {
    return fallback;
  }
  return PRO_DEFAULT_PRICE_MONTHLY;
}

/**
 * Use admin-controlled Plans.priceYearly when it is valid (> 0).
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
  return PRO_DEFAULT_PRICE_YEARLY;
}

/** First yearly subscription: deduct one month from the annual price. */
export function getProFirstYearlyAmount(
  fullYearly: number,
  monthly: number,
): number {
  return Math.max(0, fullYearly - monthly);
}

export async function userHadPriorYearlySubscription(
  pool: ConnectionPool,
  userId: number,
): Promise<boolean> {
  const result = await pool
    .request()
    .input("userId", sql.Int, userId)
    .query(`
      SELECT COUNT(*) as cnt
      FROM Subscriptions
      WHERE userId = @userId
        AND LOWER(LTRIM(RTRIM(ISNULL(billingCycle, '')))) IN ('yearly', 'annual')
    `);
  return Number(result.recordset[0]?.cnt ?? 0) > 0;
}

export async function resolveProYearlyCheckoutAmount(
  pool: ConnectionPool,
  userId: number,
  dbPriceYearly: number,
  dbPriceMonthly: number,
): Promise<{
  amount: number;
  fullYearly: number;
  monthly: number;
  isFirstYearly: boolean;
}> {
  const fullYearly = resolveProYearlyAmount(dbPriceYearly);
  const monthly = resolveProMonthlyAmount(dbPriceMonthly);
  const isFirstYearly = !(await userHadPriorYearlySubscription(pool, userId));
  const amount = isFirstYearly
    ? getProFirstYearlyAmount(fullYearly, monthly)
    : fullYearly;
  return { amount, fullYearly, monthly, isFirstYearly };
}
