import { getPool } from "../config/database";
import { applyProIntroPricingForUser } from "../config/proYearlyPricing";

export type PlanDisplayRow = {
  id: number;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  firstMonthlyPrice?: number;
  firstYearlyPrice?: number;
  eligibleFirstMonthly?: boolean;
  eligibleFirstYearly?: boolean;
  currency?: string;
  maxMenus: number;
  maxProductsPerMenu: number;
  allowCustomDomain: boolean;
  hasAds: boolean;
  features: string[];
};

export async function getActivePlansForDisplay(
  userId?: number | null,
): Promise<PlanDisplayRow[]> {
  const pool = await getPool();

  const result = await pool.request().query(`
      SELECT 
        id,
        name,
        description,
        priceMonthly,
        priceYearly,
        maxMenus,
        maxProductsPerMenu,
        allowCustomDomain,
        hasAds,
        features
      FROM Plans
      WHERE isActive = 1
      ORDER BY priceMonthly ASC
    `);

  return Promise.all(
    result.recordset.map(async (plan) => {
      const row = plan as Record<string, unknown>;
      const isPro =
        String(plan.name ?? "")
          .trim()
          .toLowerCase() === "pro";

      let priceMonthly = Number(plan.priceMonthly);
      let priceYearly = Number(plan.priceYearly);
      let firstMonthlyPrice: number | undefined;
      let firstYearlyPrice: number | undefined;
      let eligibleFirstMonthly: boolean | undefined;
      let eligibleFirstYearly: boolean | undefined;
      let currency: string | undefined;

      if (isPro) {
        const pricing = await applyProIntroPricingForUser(
          pool,
          userId ?? null,
          Number(plan.priceMonthly),
          Number(plan.priceYearly),
        );
        priceMonthly = pricing.priceMonthly;
        priceYearly = pricing.priceYearly;
        firstMonthlyPrice = pricing.firstMonthlyPrice;
        firstYearlyPrice = pricing.firstYearlyPrice;
        eligibleFirstMonthly = pricing.eligibleFirstMonthly;
        eligibleFirstYearly = pricing.eligibleFirstYearly;
        currency = pricing.currency;
      }

      return {
        id: Number(plan.id),
        name: String(plan.name ?? ""),
        description: String(plan.description ?? ""),
        priceMonthly,
        priceYearly,
        ...(firstMonthlyPrice != null ? { firstMonthlyPrice } : {}),
        ...(firstYearlyPrice != null ? { firstYearlyPrice } : {}),
        ...(eligibleFirstMonthly != null ? { eligibleFirstMonthly } : {}),
        ...(eligibleFirstYearly != null ? { eligibleFirstYearly } : {}),
        ...(currency ? { currency } : {}),
        maxMenus: Number(plan.maxMenus),
        maxProductsPerMenu: Number(plan.maxProductsPerMenu),
        allowCustomDomain: Boolean(plan.allowCustomDomain),
        hasAds: Boolean(plan.hasAds),
        features: plan.features ? JSON.parse(String(plan.features)) : [],
      };
    }),
  );
}
