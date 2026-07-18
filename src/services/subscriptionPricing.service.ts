import { getPool, sql } from "../config/database";
import { EXTRA_MENU_PRICE_EGP } from "../config/constants";
import { ensureSubscriptionExtrasSchema } from "../schemas/subscriptionExtras.schema";

/** Resolve Pro extra menu price from Plans.extraMenuPrice (fallback: env / default 20). */
export async function getProExtraMenuPriceEgp(): Promise<number> {
  await ensureSubscriptionExtrasSchema();
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT TOP 1 extraMenuPrice
    FROM Plans
    WHERE LOWER(LTRIM(RTRIM(name))) = N'pro'
  `);
  const price = Number(result.recordset[0]?.extraMenuPrice);
  if (Number.isFinite(price) && price > 0) {
    return price;
  }
  return EXTRA_MENU_PRICE_EGP;
}

export function resolveExtraMenuUnitPrice(
  planExtraMenuPrice: unknown,
): number {
  const price = Number(planExtraMenuPrice);
  if (Number.isFinite(price) && price > 0) {
    return price;
  }
  return EXTRA_MENU_PRICE_EGP;
}
