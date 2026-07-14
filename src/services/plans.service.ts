import { getPool } from "../config/database";
import { applyProIntroPricingForUser } from "../config/proYearlyPricing";
import { ensurePlanCapabilitiesSchema } from "../schemas/planCapabilities.schema";
import { ensureSubscriptionExtrasSchema } from "../schemas/subscriptionExtras.schema";
import {
  getCustomPlanDisplay,
  parsePlanCapabilities,
} from "./planCapabilities.service";
import {
  FREE_PLAN_CAPABILITIES_DEFAULT,
  PRO_PLAN_CAPABILITIES_DEFAULT,
  type PlanCapabilities,
} from "../types/planCapabilities";

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
  extraMenuPrice?: number | null;
  features: string[];
  capabilities: PlanCapabilities;
};

function defaultsForName(name: string): PlanCapabilities {
  return name.trim().toLowerCase() === "free"
    ? FREE_PLAN_CAPABILITIES_DEFAULT
    : PRO_PLAN_CAPABILITIES_DEFAULT;
}

export async function getActivePlansForDisplay(
  userId?: number | null,
): Promise<PlanDisplayRow[]> {
  await ensureSubscriptionExtrasSchema();
  await ensurePlanCapabilitiesSchema();
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
        features,
        extraMenuPrice,
        capabilities
      FROM Plans
      WHERE isActive = 1
      ORDER BY priceMonthly ASC
    `);

  return Promise.all(
    result.recordset.map(async (plan) => {
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

      const planName = String(plan.name ?? "");
      const capabilities = parsePlanCapabilities(
        plan.capabilities,
        defaultsForName(planName),
      );

      return {
        id: Number(plan.id),
        name: planName,
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
        extraMenuPrice:
          plan.extraMenuPrice != null && plan.extraMenuPrice !== ""
            ? Number(plan.extraMenuPrice)
            : null,
        features: plan.features ? JSON.parse(String(plan.features)) : [],
        capabilities,
      };
    }),
  );
}

export async function getPlansWithCustomDisplay(userId?: number | null) {
  const [plans, customDisplay] = await Promise.all([
    getActivePlansForDisplay(userId),
    getCustomPlanDisplay(),
  ]);
  return { plans, customDisplay };
}
