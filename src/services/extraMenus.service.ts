import { getPool, sql } from "../config/database";
import {
  EXTRA_MENU_BILLING_DAYS,
  EXTRA_MENU_PRICE_EGP,
} from "../config/constants";
import { ensureSubscriptionExtrasSchema } from "../schemas/subscriptionExtras.schema";
import { resolveExtraMenuUnitPrice } from "./subscriptionPricing.service";

export { EXTRA_MENU_PRICE_EGP, EXTRA_MENU_BILLING_DAYS };

export type ActiveSubscriptionLimits = {
  subscriptionId: number;
  planName: string;
  maxMenus: number;
  extraMenus: number;
  effectiveMaxMenus: number;
  isPro: boolean;
  endDate: Date | null;
  billingCycle: string | null;
  subscriptionDaysRemaining: number;
  subscriptionMonthsRemaining: number;
  extraMenuProratedPrice: number;
  extraMenuShortPeriodWarning: boolean;
};

/** Whole days left until subscription end (minimum 1 if still active). */
export function getRemainingSubscriptionDays(
  endDate: Date | string | null | undefined,
  now: Date = new Date(),
): number {
  const end =
    endDate instanceof Date
      ? new Date(endDate.getTime())
      : endDate
        ? new Date(endDate)
        : null;
  if (!end || !Number.isFinite(end.getTime()) || end <= now) {
    return 0;
  }
  const ms = end.getTime() - now.getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

/** Display-friendly months (for UI when period is ≥ 1 month). */
export function getRemainingSubscriptionMonths(
  endDate: Date | string | null | undefined,
  now: Date = new Date(),
): number {
  const days = getRemainingSubscriptionDays(endDate, now);
  if (days <= 0) return 0;
  return Math.max(1, Math.ceil(days / EXTRA_MENU_BILLING_DAYS));
}

/** One extra menu: full month price from plan settings. */
export function getExtraMenuPurchaseUnitPrice(
  unitPrice: number = EXTRA_MENU_PRICE_EGP,
): number {
  return unitPrice;
}

export function getExtraMenusPurchaseAmount(
  quantity: number,
  unitPrice: number = EXTRA_MENU_PRICE_EGP,
): number {
  return Math.max(0, quantity) * unitPrice;
}

export function getExtraMenusRenewalAmount(
  extraMenus: number,
  billing: "monthly" | "yearly",
  unitPrice: number = EXTRA_MENU_PRICE_EGP,
): number {
  if (extraMenus <= 0) return 0;
  const multiplier = billing === "yearly" ? 12 : 1;
  return extraMenus * unitPrice * multiplier;
}

export function getExtraMenuPricingFromEndDate(
  endDate: Date | string | null | undefined,
  now: Date = new Date(),
  unitPrice: number = EXTRA_MENU_PRICE_EGP,
): {
  subscriptionDaysRemaining: number;
  subscriptionMonthsRemaining: number;
  extraMenuProratedPrice: number;
  extraMenuShortPeriodWarning: boolean;
} {
  const subscriptionDaysRemaining = getRemainingSubscriptionDays(endDate, now);
  return {
    subscriptionDaysRemaining,
    subscriptionMonthsRemaining: getRemainingSubscriptionMonths(endDate, now),
    extraMenuProratedPrice: getExtraMenuPurchaseUnitPrice(unitPrice),
    extraMenuShortPeriodWarning: hasExtraMenuShortPeriodWarning(
      subscriptionDaysRemaining,
    ),
  };
}

export function hasExtraMenuShortPeriodWarning(
  remainingDays: number,
): boolean {
  return remainingDays > 0 && remainingDays < EXTRA_MENU_BILLING_DAYS;
}

export async function getActiveSubscriptionLimits(
  userId: number,
): Promise<ActiveSubscriptionLimits | null> {
  await ensureSubscriptionExtrasSchema();
  const pool = await getPool();

  const result = await pool.request().input("userId", sql.Int, userId).query(`
    SELECT TOP 1
      s.id AS subscriptionId,
      s.endDate,
      s.billingCycle,
      p.name AS planName,
      p.maxMenus,
      ISNULL(s.extraMenus, 0) AS extraMenus,
      p.extraMenuPrice
    FROM Subscriptions s
    JOIN Plans p ON s.planId = p.id
    WHERE s.userId = @userId
      AND s.status = 'active'
      AND (s.endDate IS NULL OR s.endDate > GETDATE())
    ORDER BY s.id DESC
  `);

  if (result.recordset.length === 0) {
    return null;
  }

  const row = result.recordset[0];
  const maxMenus = Number(row.maxMenus ?? 1);
  const extraMenus = Number(row.extraMenus ?? 0);
  const planName = String(row.planName ?? "Free");
  const isPro = planName.trim().toLowerCase() === "pro";
  const endDateRaw = row.endDate as Date | null | undefined;
  const endDate =
    endDateRaw instanceof Date
      ? endDateRaw
      : endDateRaw
        ? new Date(endDateRaw)
        : null;
  const unitPrice = resolveExtraMenuUnitPrice(row.extraMenuPrice);
  const pricing = getExtraMenuPricingFromEndDate(endDate, new Date(), unitPrice);

  return {
    subscriptionId: Number(row.subscriptionId),
    planName,
    maxMenus,
    extraMenus,
    effectiveMaxMenus: maxMenus + extraMenus,
    isPro,
    endDate,
    billingCycle: row.billingCycle != null ? String(row.billingCycle) : null,
    ...pricing,
  };
}

export async function getUserExtraMenusCount(userId: number): Promise<number> {
  const limits = await getActiveSubscriptionLimits(userId);
  return limits?.extraMenus ?? 0;
}

/** Admin: set absolute extra menu count on an active subscription. */
export async function setSubscriptionExtraMenus(
  subscriptionId: number,
  extraMenus: number,
): Promise<{ extraMenus: number }> {
  await ensureSubscriptionExtrasSchema();
  const count = Math.max(0, Math.min(100, Math.floor(Number(extraMenus))));
  const pool = await getPool();

  const result = await pool
    .request()
    .input("subscriptionId", sql.Int, subscriptionId)
    .input("extraMenus", sql.Int, count).query(`
      UPDATE Subscriptions
      SET extraMenus = @extraMenus
      WHERE id = @subscriptionId AND status = 'active'
    `);

  if (!result.rowsAffected[0]) {
    throw new Error("SUBSCRIPTION_NOT_ACTIVE");
  }

  return { extraMenus: count };
}

export async function applyExtraMenusPurchase(
  paymentId: string,
  userId: number,
  subscriptionId: number,
  quantity: number,
  amount: number,
): Promise<void> {
  await ensureSubscriptionExtrasSchema();
  const pool = await getPool();

  const existing = await pool
    .request()
    .input("paymentId", sql.UniqueIdentifier, paymentId)
    .query(`SELECT paymentId FROM ExtraMenuPurchases WHERE paymentId = @paymentId`);

  if (existing.recordset.length > 0) {
    return;
  }

  const trx = pool.transaction();
  await trx.begin();
  try {
    await new sql.Request(trx)
      .input("paymentId", sql.UniqueIdentifier, paymentId)
      .input("userId", sql.Int, userId)
      .input("subscriptionId", sql.Int, subscriptionId)
      .input("quantity", sql.Int, quantity)
      .input("amount", sql.Decimal(12, 2), amount).query(`
        INSERT INTO ExtraMenuPurchases (paymentId, userId, subscriptionId, quantity, amount)
        VALUES (@paymentId, @userId, @subscriptionId, @quantity, @amount)
      `);

    await new sql.Request(trx)
      .input("subscriptionId", sql.Int, subscriptionId)
      .input("quantity", sql.Int, quantity).query(`
        UPDATE Subscriptions
        SET extraMenus = ISNULL(extraMenus, 0) + @quantity
        WHERE id = @subscriptionId AND status = 'active'
      `);

    await trx.commit();
  } catch (e) {
    try {
      await trx.rollback();
    } catch {
      /* ignore */
    }
    throw e;
  }
}
