import sql from "mssql";
import type { ConnectionPool } from "mssql";

/** Pro subscription checkout and display currency */
export const PRO_YEARLY_CURRENCY = "EGP";

export const PRO_DEFAULT_PRICE_MONTHLY = 2;
export const PRO_DEFAULT_FIRST_MONTHLY_PRICE = 99;
export const PRO_DEFAULT_PRICE_YEARLY = 5988;
export const PRO_DEFAULT_FIRST_YEARLY_PRICE = 5489;

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
    parseEnvPrice("PRO_MONTHLY_PRICE") ?? parseEnvPrice("PRO_MONTHLY_PRICE_EGP")
  );
}

function getProFirstMonthlyAmountEnvFallback(): number | null {
  return (
    parseEnvPrice("PRO_FIRST_MONTHLY_PRICE") ??
    parseEnvPrice("PRO_FIRST_MONTHLY_PRICE_EGP")
  );
}

function getProFirstYearlyAmountEnvFallback(): number | null {
  return (
    parseEnvPrice("PRO_FIRST_YEARLY_PRICE") ??
    parseEnvPrice("PRO_FIRST_YEARLY_PRICE_EGP")
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

/** First yearly subscription intro price (independent from monthly offer). */
export function getProFirstYearlyAmount(): number {
  const fallback = getProFirstYearlyAmountEnvFallback();
  if (fallback != null) {
    return fallback;
  }
  return PRO_DEFAULT_FIRST_YEARLY_PRICE;
}

/** Introductory first month for monthly billing (regular renewals use full monthly). */
export function getProFirstMonthlyAmount(): number {
  const fallback = getProFirstMonthlyAmountEnvFallback();
  if (fallback != null) {
    return fallback;
  }
  return PRO_DEFAULT_FIRST_MONTHLY_PRICE;
}

const PRO_PAID_SUBSCRIPTION_FILTER = `
  INNER JOIN Plans p ON s.planId = p.id
  WHERE s.userId = @userId
    AND LOWER(LTRIM(RTRIM(p.name))) = N'pro'
    AND (
      LOWER(LTRIM(RTRIM(ISNULL(s.paymentStatus, '')))) = N'completed'
      OR ISNULL(s.amount, 0) > 0
    )
`;

/** True if user had a paid Pro subscription on monthly billing (independent of yearly). */
export async function userHadPriorMonthlySubscription(
  pool: ConnectionPool,
  userId: number,
): Promise<boolean> {
  const result = await pool.request().input("userId", sql.Int, userId).query(`
      SELECT COUNT(*) as cnt
      FROM Subscriptions s
      ${PRO_PAID_SUBSCRIPTION_FILTER}
        AND LOWER(LTRIM(RTRIM(ISNULL(s.billingCycle, '')))) = N'monthly'
    `);
  return Number(result.recordset[0]?.cnt ?? 0) > 0;
}

/** True if user had a paid Pro subscription on yearly billing (independent of monthly). */
export async function userHadPriorYearlySubscription(
  pool: ConnectionPool,
  userId: number,
): Promise<boolean> {
  const result = await pool.request().input("userId", sql.Int, userId).query(`
      SELECT COUNT(*) as cnt
      FROM Subscriptions s
      ${PRO_PAID_SUBSCRIPTION_FILTER}
        AND LOWER(LTRIM(RTRIM(ISNULL(s.billingCycle, '')))) IN (N'yearly', N'annual')
    `);
  return Number(result.recordset[0]?.cnt ?? 0) > 0;
}

export async function resolveProMonthlyCheckoutAmount(
  pool: ConnectionPool,
  userId: number,
  dbPriceMonthly: number,
): Promise<{
  amount: number;
  fullMonthly: number;
  firstMonthly: number;
  isFirstMonthly: boolean;
}> {
  const fullMonthly = resolveProMonthlyAmount(dbPriceMonthly);
  const firstMonthly = getProFirstMonthlyAmount();
  const isFirstMonthly = !(await userHadPriorMonthlySubscription(pool, userId));
  const amount = isFirstMonthly ? firstMonthly : fullMonthly;
  return { amount, fullMonthly, firstMonthly, isFirstMonthly };
}

export type ProIntroPricing = {
  priceMonthly: number;
  priceYearly: number;
  firstMonthlyPrice?: number;
  firstYearlyPrice?: number;
  eligibleFirstMonthly?: boolean;
  eligibleFirstYearly?: boolean;
  currency: string;
};

/** Resolve Pro list/checkout prices; monthly and yearly intro offers are evaluated independently. */
export async function applyProIntroPricingForUser(
  pool: ConnectionPool,
  userId: number | null | undefined,
  dbPriceMonthly: number,
  dbPriceYearly: number,
): Promise<ProIntroPricing> {
  const priceMonthly = resolveProMonthlyAmount(dbPriceMonthly);
  const priceYearly = resolveProYearlyAmount(dbPriceYearly);
  const base: ProIntroPricing = {
    priceMonthly,
    priceYearly,
    currency: PRO_YEARLY_CURRENCY,
  };

  if (userId == null || !Number.isFinite(userId)) {
    return {
      ...base,
      eligibleFirstMonthly: true,
      eligibleFirstYearly: true,
      firstMonthlyPrice: getProFirstMonthlyAmount(),
      firstYearlyPrice: getProFirstYearlyAmount(),
    };
  }

  const [hadMonthly, hadYearly] = await Promise.all([
    userHadPriorMonthlySubscription(pool, userId),
    userHadPriorYearlySubscription(pool, userId),
  ]);

  const eligibleFirstMonthly = !hadMonthly;
  const eligibleFirstYearly = !hadYearly;

  return {
    ...base,
    eligibleFirstMonthly,
    eligibleFirstYearly,
    ...(eligibleFirstMonthly
      ? { firstMonthlyPrice: getProFirstMonthlyAmount() }
      : {}),
    ...(eligibleFirstYearly
      ? { firstYearlyPrice: getProFirstYearlyAmount() }
      : {}),
  };
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
  const amount = isFirstYearly ? getProFirstYearlyAmount() : fullYearly;
  return { amount, fullYearly, monthly, isFirstYearly };
}
