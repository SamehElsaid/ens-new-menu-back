import { getPool, sql } from "../config/database";

export type ProRenewalInfo = {
  canRenew: boolean;
  subscriptionId: number | null;
  extendFromEndDate: string | null;
  daysRemaining: number;
  isInGracePeriod: boolean;
  billingCycle: "monthly" | "yearly" | null;
  extraMenus: number;
};

type ProRenewalRow = {
  id: number;
  endDate: Date | null;
  billingCycle: string | null;
  extraMenus: number;
  status: string;
};

function addBillingPeriod(base: Date, billing: "monthly" | "yearly"): Date {
  const end = new Date(base);
  if (billing === "monthly") {
    end.setMonth(end.getMonth() + 1);
  } else {
    end.setFullYear(end.getFullYear() + 1);
  }
  return end;
}

function normalizeBilling(raw: string | null | undefined): "monthly" | "yearly" {
  const c = String(raw ?? "").trim().toLowerCase();
  if (c === "yearly" || c === "annual") return "yearly";
  return "monthly";
}

/** Fetch active Pro subscription eligible for renewal (before end date). */
export async function fetchProSubscriptionForRenewal(
  userId: number,
): Promise<ProRenewalRow | null> {
  const pool = await getPool();
  const result = await pool.request().input("userId", sql.Int, userId).query(`
    SELECT TOP 1
      s.id,
      s.endDate,
      s.billingCycle,
      ISNULL(s.extraMenus, 0) AS extraMenus,
      s.status
    FROM Subscriptions s
    INNER JOIN Plans p ON s.planId = p.id
    WHERE s.userId = @userId
      AND LOWER(LTRIM(RTRIM(p.name))) = N'pro'
      AND s.status = N'active'
      AND s.endDate IS NOT NULL
      AND s.endDate > GETDATE()
    ORDER BY s.id DESC
  `);

  if (result.recordset.length === 0) {
    return null;
  }
  return result.recordset[0] as ProRenewalRow;
}

export function computeRenewalExtensionEndDate(
  currentEndDate: Date | null | undefined,
  billingCycle: "monthly" | "yearly",
  now: Date = new Date(),
): Date {
  const end =
    currentEndDate instanceof Date
      ? new Date(currentEndDate.getTime())
      : currentEndDate
        ? new Date(currentEndDate)
        : now;
  const baseDate = end > now ? end : now;
  return addBillingPeriod(baseDate, billingCycle);
}

export async function getProRenewalInfo(userId: number): Promise<ProRenewalInfo> {
  const row = await fetchProSubscriptionForRenewal(userId);
  if (!row) {
    return {
      canRenew: false,
      subscriptionId: null,
      extendFromEndDate: null,
      daysRemaining: 0,
      isInGracePeriod: false,
      billingCycle: null,
      extraMenus: 0,
    };
  }

  const now = new Date();
  const endDate =
    row.endDate instanceof Date
      ? row.endDate
      : row.endDate
        ? new Date(row.endDate)
        : null;

  let daysRemaining = 0;
  if (endDate && endDate > now) {
    daysRemaining = Math.max(
      1,
      Math.ceil((endDate.getTime() - now.getTime()) / 86_400_000),
    );
  }

  const extendFrom = endDate && endDate > now ? endDate : now;

  return {
    canRenew: true,
    subscriptionId: row.id,
    extendFromEndDate: extendFrom.toISOString(),
    daysRemaining,
    isInGracePeriod: false,
    billingCycle: normalizeBilling(row.billingCycle),
    extraMenus: Number(row.extraMenus ?? 0),
  };
}

export async function renewProSubscriptionForUser(
  userId: number,
  planId: number,
  billingCycle: "monthly" | "yearly",
  paidAmount: number,
  paidAt: Date,
  extraMenus?: number,
): Promise<{ subscriptionId: number; endDate: Date } | null> {
  const row = await fetchProSubscriptionForRenewal(userId);
  if (!row) {
    return null;
  }

  const newEnd = computeRenewalExtensionEndDate(row.endDate, billingCycle);
  const extraCount =
    extraMenus !== undefined
      ? Math.max(0, Math.min(100, Math.floor(Number(extraMenus))))
      : Number(row.extraMenus ?? 0);
  const pool = await getPool();

  await pool
    .request()
    .input("subId", sql.Int, row.id)
    .input("planId", sql.Int, planId)
    .input("endDate", sql.DateTime2, newEnd)
    .input("billingCycle", sql.NVarChar(20), billingCycle)
    .input("paidAt", sql.DateTime2, paidAt)
    .input("amount", sql.Decimal(12, 2), paidAmount)
    .input("extraMenus", sql.Int, extraCount).query(`
      UPDATE Subscriptions
      SET
        planId = @planId,
        status = N'active',
        endDate = @endDate,
        billingCycle = @billingCycle,
        paymentStatus = N'completed',
        paidAt = @paidAt,
        amount = @amount,
        extraMenus = @extraMenus,
        gracePeriodStartDate = NULL,
        gracePeriodEndDate = NULL,
        notificationSent = 0,
        expiryNotificationSent = 0
      WHERE id = @subId
    `);

  return { subscriptionId: row.id, endDate: newEnd };
}
