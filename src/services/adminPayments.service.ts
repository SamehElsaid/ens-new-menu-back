import { getPool, sql } from "../config/database";

type PaymentStatusFilter =
  | "success"
  | "pending"
  | "failed"
  | "cancelled"
  | "refunded"
  | "all";

type PaymentsPeriod = "7d" | "30d" | "90d" | "all";

type SubscriptionSourceFilter = "all" | "paid" | "admin";

type SubscriptionStatusFilter = "all" | "active" | "expired" | "cancelled";

function resolveSubscriptionStatus(
  dbStatus: string | null | undefined,
  endDate: Date | string | null | undefined,
): "active" | "expired" | "cancelled" {
  const st = String(dbStatus ?? "").toLowerCase();
  if (st === "cancelled" || st === "canceled") return "cancelled";
  if (st === "expired") return "expired";
  if (st === "active") {
    if (!endDate) return "active";
    const end = new Date(endDate);
    if (Number.isNaN(end.getTime())) return "active";
    return end > new Date() ? "active" : "expired";
  }
  if (endDate) {
    const end = new Date(endDate);
    if (!Number.isNaN(end.getTime()) && end > new Date()) return "active";
  }
  return "expired";
}

function mapDbStatus(dbStatus: string): string {
  const s = String(dbStatus ?? "").toLowerCase();
  if (s === "completed" || s === "paid" || s === "success") return "success";
  if (s === "pending") return "pending";
  if (s === "failed") return "failed";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "refunded") return "refunded";
  return "pending";
}

function mapDbStatusToQuery(status: PaymentStatusFilter): string | null {
  if (status === "success") return "completed";
  if (status === "pending") return "pending";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  if (status === "refunded") return "refunded";
  return null;
}

function mapPaymentMethod(raw: string | null): string {
  const m = String(raw ?? "").toLowerCase();
  if (
    ["visa", "mastercard", "orange_money", "etisalat_cash", "vodafone_cash"].includes(
      m,
    )
  ) {
    return m;
  }
  if (m.includes("vodafone")) return "vodafone_cash";
  if (m.includes("orange")) return "orange_money";
  if (m.includes("etisalat")) return "etisalat_cash";
  if (m.includes("visa")) return "visa";
  if (m.includes("master")) return "mastercard";
  return "unknown";
}

function inferBillingCycle(
  amount: number,
  priceMonthly: number,
  priceYearly: number,
): "monthly" | "yearly" {
  if (!Number.isFinite(amount)) return "monthly";
  if (
    Number.isFinite(priceYearly) &&
    priceYearly > 0 &&
    Math.abs(amount - priceYearly) <= Math.max(1, priceYearly * 0.05)
  ) {
    return "yearly";
  }
  return "monthly";
}

function normalizeBillingCycle(raw: string | null | undefined): "monthly" | "yearly" {
  const b = String(raw ?? "").toLowerCase();
  return b === "yearly" ? "yearly" : "monthly";
}

async function loadPaymentStatistics(pool: Awaited<ReturnType<typeof getPool>>) {
  const paymentStatsResult = await pool.request().query(`
    SELECT
      SUM(CASE WHEN payment_status = 'completed' THEN amount ELSE 0 END) AS totalRevenue,
      SUM(CASE WHEN payment_status = 'completed'
        AND MONTH(ISNULL(updated_at, created_at)) = MONTH(GETDATE())
        AND YEAR(ISNULL(updated_at, created_at)) = YEAR(GETDATE())
        THEN amount ELSE 0 END) AS revenueThisMonth,
      SUM(CASE WHEN payment_status = 'completed' THEN 1 ELSE 0 END) AS successfulCount,
      SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END) AS pendingCount,
      SUM(CASE WHEN payment_status = 'failed' THEN 1 ELSE 0 END) AS failedCount
    FROM payments
    WHERE payment_method = N'easykash'
  `);
  return paymentStatsResult.recordset[0] ?? {};
}

async function loadProSubscriberStatistics(pool: Awaited<ReturnType<typeof getPool>>) {
  const statsResult = await pool.request().query(`
    WITH ActivePro AS (
      SELECT
        s.userId,
        s.startDate,
        ROW_NUMBER() OVER (PARTITION BY s.userId ORDER BY s.startDate DESC) AS rn
      FROM Subscriptions s
      INNER JOIN Plans pl ON s.planId = pl.id
      WHERE s.status = 'active'
        AND (s.endDate IS NULL OR s.endDate > GETDATE())
        AND LOWER(LTRIM(RTRIM(pl.name))) = N'pro'
    ),
    LatestPro AS (
      SELECT userId, startDate FROM ActivePro WHERE rn = 1
    ),
    PaidMatch AS (
      SELECT lp.userId,
        ROW_NUMBER() OVER (
          PARTITION BY lp.userId
          ORDER BY ISNULL(p.updated_at, p.created_at) DESC
        ) AS prn
      FROM LatestPro lp
      INNER JOIN [subscriptionCheckout] o ON o.user_id = lp.userId
      INNER JOIN payments p ON p.order_id = o.id
        AND p.payment_method = N'easykash'
        AND p.payment_status = N'completed'
        AND ABS(DATEDIFF(hour, ISNULL(p.updated_at, p.created_at), lp.startDate)) <= 168
    )
    SELECT
      COUNT(*) AS proActiveCount,
      SUM(CASE WHEN pm.userId IS NOT NULL THEN 1 ELSE 0 END) AS paidActiveCount,
      SUM(CASE WHEN pm.userId IS NULL THEN 1 ELSE 0 END) AS adminGrantedCount
    FROM LatestPro lp
    LEFT JOIN PaidMatch pm ON pm.userId = lp.userId AND pm.prn = 1
  `);
  return statsResult.recordset[0] ?? {};
}

/** Active Pro subscribers with paid vs admin-granted source. */
export async function buildAdminPaymentsResponse(params: {
  page: number;
  limit: number;
  status?: PaymentStatusFilter;
  period?: PaymentsPeriod;
  search?: string;
  source?: SubscriptionSourceFilter;
  subscriptionStatus?: SubscriptionStatusFilter;
}) {
  const pool = await getPool();
  const page = Math.max(1, params.page);
  const limit = Math.min(100, Math.max(1, params.limit));
  const offset = (page - 1) * limit;
  const sourceFilter = params.source ?? "all";
  const subscriptionStatusFilter = params.subscriptionStatus ?? "all";
  const status = params.status ?? "all";

  const planRow = await pool.request().query(`
    SELECT TOP 1 id, priceMonthly, priceYearly FROM Plans
    WHERE isActive = 1 AND LOWER(LTRIM(RTRIM(name))) = N'pro'
  `);
  const proPlanId = Number(planRow.recordset[0]?.id ?? 0);
  const priceMonthly = Number(planRow.recordset[0]?.priceMonthly ?? 0);
  const priceYearly = Number(planRow.recordset[0]?.priceYearly ?? 0);

  const [payStats, subStats] = await Promise.all([
    loadPaymentStatistics(pool),
    loadProSubscriberStatistics(pool),
  ]);

  const statistics = {
    totalRevenue: Number(payStats.totalRevenue ?? 0),
    revenueThisMonth: Number(payStats.revenueThisMonth ?? 0),
    successfulCount: Number(payStats.successfulCount ?? 0),
    pendingCount: Number(payStats.pendingCount ?? 0),
    failedCount: Number(payStats.failedCount ?? 0),
    proActiveCount: Number(subStats.proActiveCount ?? 0),
    paidActiveCount: Number(subStats.paidActiveCount ?? 0),
    adminGrantedCount: Number(subStats.adminGrantedCount ?? 0),
    currency: "EGP",
  };

  const showPaymentAttempts =
    status !== "all" && status !== "success";

  if (showPaymentAttempts) {
    return buildPaymentAttemptsList(pool, {
      page,
      limit,
      offset,
      status,
      period: params.period,
      search: params.search,
      priceMonthly,
      priceYearly,
      statistics,
    });
  }

  const request = pool.request();
  if (proPlanId > 0) {
    request.input("proPlanId", sql.Int, proPlanId);
  }

  if (params.period && params.period !== "all") {
    const days = params.period === "7d" ? 7 : params.period === "90d" ? 90 : 30;
    request.input("periodDays", sql.Int, days);
  }

  if (params.search?.trim()) {
    request.input("search", sql.NVarChar, `%${params.search.trim()}%`);
  }

  const proPlanClause = proPlanId > 0
    ? "s.planId = @proPlanId"
    : "LOWER(LTRIM(RTRIM(pl.name))) = N'pro'";

  const paidPeriodClause =
    params.period && params.period !== "all"
      ? "AND cp.paymentAt >= DATEADD(day, -@periodDays, GETDATE())"
      : "";
  const adminPeriodClause =
    params.period && params.period !== "all"
      ? "AND ar.startDate >= DATEADD(day, -@periodDays, GETDATE())"
      : "";

  const subscriptionStatusClause = (
    alias: string,
    allowMissingSubscription = false,
  ): string => {
    if (subscriptionStatusFilter === "all") return "";
    let core = "";
    if (subscriptionStatusFilter === "active") {
      core = `${alias}.subscriptionDbStatus = N'active' AND (${alias}.endDate IS NULL OR ${alias}.endDate > GETDATE())`;
    } else if (subscriptionStatusFilter === "expired") {
      core = `(${alias}.subscriptionDbStatus = N'expired' OR (${alias}.subscriptionDbStatus = N'active' AND ${alias}.endDate IS NOT NULL AND ${alias}.endDate <= GETDATE()))`;
    } else if (subscriptionStatusFilter === "cancelled") {
      core = `(${alias}.subscriptionDbStatus = N'cancelled' OR ${alias}.subscriptionDbStatus = N'canceled')`;
    }
    if (!core) return "";
    if (allowMissingSubscription) {
      return `AND (${alias}.subscriptionId IS NULL OR (${core}))`;
    }
    return `AND (${core})`;
  };

  const paidSearchClause = params.search?.trim()
    ? `AND (
      CAST(cp.paymentId AS NVARCHAR(36)) LIKE @search
      OR ISNULL(cp.userName, '') LIKE @search
      OR ISNULL(cp.userEmail, '') LIKE @search
      OR ISNULL(cp.customer_reference, '') LIKE @search
      OR ISNULL(cp.easykash_ref, '') LIKE @search
      OR CAST(ISNULL(cp.order_id, '') AS NVARCHAR(36)) LIKE @search
      OR CAST(ISNULL(cp.subscriptionId, '') AS NVARCHAR(20)) LIKE @search
    )`
    : "";

  const adminSearchClause = params.search?.trim()
    ? `AND (
      CAST(ar.subscriptionId AS NVARCHAR(20)) LIKE @search
      OR ISNULL(ar.userName, '') LIKE @search
      OR ISNULL(ar.userEmail, '') LIKE @search
    )`
    : "";

  const includePaid = sourceFilter !== "admin";
  const includeAdmin = sourceFilter !== "paid";

  request.input("offset", sql.Int, offset);
  request.input("limit", sql.Int, limit);

  const historyCte = `
    WITH ProSubs AS (
      SELECT
        s.id AS subscriptionId,
        s.userId,
        s.planId,
        s.billingCycle,
        s.startDate,
        s.endDate,
        s.status AS subscriptionDbStatus,
        s.paymentStatus,
        s.paidAt AS subscriptionPaidAt,
        s.amount AS subscriptionAmount,
        u.name AS userName,
        u.email AS userEmail,
        pl.name AS planName
      FROM Subscriptions s
      INNER JOIN Users u ON s.userId = u.id
      INNER JOIN Plans pl ON s.planId = pl.id
      WHERE ${proPlanClause}
    ),
    CompletedProPayments AS (
      SELECT
        p.id AS paymentId,
        p.order_id,
        p.amount AS paymentAmount,
        p.payment_method,
        p.customer_reference,
        p.easykash_ref,
        p.created_at AS paymentCreatedAt,
        p.updated_at AS paymentUpdatedAt,
        ISNULL(p.updated_at, p.created_at) AS paymentAt,
        o.user_id AS userId,
        u.name AS userName,
        u.email AS userEmail
      FROM payments p
      INNER JOIN [subscriptionCheckout] o ON p.order_id = o.id
      INNER JOIN Users u ON o.user_id = u.id
      WHERE p.payment_method = N'easykash'
        AND p.payment_status = N'completed'
        AND (
          p.customer_reference LIKE N'%"kind":"pro_monthly"%'
          OR p.customer_reference LIKE N'%"kind":"pro_yearly"%'
        )
    ),
    PaymentSubPick AS (
      SELECT
        cp.paymentId,
        ps.subscriptionId,
        ps.billingCycle,
        ps.startDate,
        ps.endDate,
        ps.subscriptionDbStatus,
        ps.paymentStatus,
        ps.subscriptionPaidAt,
        ps.subscriptionAmount,
        ps.planName,
        ROW_NUMBER() OVER (
          PARTITION BY cp.paymentId
          ORDER BY
            CASE
              WHEN ps.subscriptionDbStatus = N'active'
                AND (ps.endDate IS NULL OR ps.endDate > GETDATE())
              THEN 0
              ELSE 1
            END,
            ps.startDate DESC,
            ABS(DATEDIFF(minute, cp.paymentAt, ps.startDate))
        ) AS prn
      FROM CompletedProPayments cp
      INNER JOIN ProSubs ps ON ps.userId = cp.userId
        AND ABS(DATEDIFF(hour, cp.paymentAt, ps.startDate)) <= 168
    ),
    PaidHistory AS (
      SELECT
        cp.paymentId,
        cp.order_id,
        cp.paymentAmount,
        cp.payment_method,
        cp.customer_reference,
        cp.easykash_ref,
        cp.paymentCreatedAt,
        cp.paymentUpdatedAt,
        cp.paymentAt,
        cp.userId,
        cp.userName,
        cp.userEmail,
        psp.subscriptionId,
        psp.billingCycle,
        psp.startDate,
        psp.endDate,
        psp.subscriptionDbStatus,
        psp.paymentStatus,
        psp.subscriptionPaidAt,
        psp.subscriptionAmount,
        psp.planName,
        CAST(1 AS bit) AS isPaidRow
      FROM CompletedProPayments cp
      LEFT JOIN PaymentSubPick psp ON psp.paymentId = cp.paymentId AND psp.prn = 1
      WHERE 1 = 1
        ${paidPeriodClause}
        ${subscriptionStatusClause("psp", true)}
        ${paidSearchClause}
    ),
    AdminHistory AS (
      SELECT
        CAST(NULL AS uniqueidentifier) AS paymentId,
        CAST(NULL AS uniqueidentifier) AS order_id,
        CAST(NULL AS decimal(12, 2)) AS paymentAmount,
        CAST(NULL AS nvarchar(50)) AS payment_method,
        CAST(NULL AS nvarchar(max)) AS customer_reference,
        CAST(NULL AS nvarchar(255)) AS easykash_ref,
        CAST(NULL AS datetime2) AS paymentCreatedAt,
        CAST(NULL AS datetime2) AS paymentUpdatedAt,
        ar.startDate AS paymentAt,
        ar.userId,
        ar.userName,
        ar.userEmail,
        ar.subscriptionId,
        ar.billingCycle,
        ar.startDate,
        ar.endDate,
        ar.subscriptionDbStatus,
        ar.paymentStatus,
        ar.subscriptionPaidAt,
        ar.subscriptionAmount,
        ar.planName,
        CAST(0 AS bit) AS isPaidRow
      FROM ProSubs ar
      WHERE NOT EXISTS (
        SELECT 1
        FROM CompletedProPayments cp
        WHERE cp.userId = ar.userId
          AND ABS(DATEDIFF(hour, cp.paymentAt, ar.startDate)) <= 168
      )
        ${adminPeriodClause}
        ${subscriptionStatusClause("ar")}
        ${adminSearchClause}
    ),
    CombinedHistory AS (
      ${includePaid ? "SELECT * FROM PaidHistory" : "SELECT * FROM PaidHistory WHERE 1 = 0"}
      ${includePaid && includeAdmin ? "UNION ALL" : ""}
      ${includeAdmin ? "SELECT * FROM AdminHistory" : ""}
    )
  `;

  const listResult = await request.query(`
    ${historyCte}
    SELECT *
    FROM CombinedHistory
    ORDER BY paymentAt DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);

  const countRequest = pool.request();
  if (proPlanId > 0) {
    countRequest.input("proPlanId", sql.Int, proPlanId);
  }
  if (params.period && params.period !== "all") {
    const days = params.period === "7d" ? 7 : params.period === "90d" ? 90 : 30;
    countRequest.input("periodDays", sql.Int, days);
  }
  if (params.search?.trim()) {
    countRequest.input("search", sql.NVarChar, `%${params.search.trim()}%`);
  }

  const countResult = await countRequest.query(`
    ${historyCte}
    SELECT COUNT(*) AS total FROM CombinedHistory
  `);

  const totalItems = Number(countResult.recordset[0]?.total ?? 0);

  const transactions = listResult.recordset.map((row) => {
    const isPaid = Boolean(row.isPaidRow);
    const subscriptionSource = isPaid ? "paid" : "admin";
    const subAmount = Number(row.subscriptionAmount ?? 0);
    const amount = isPaid
      ? Number(row.paymentAmount ?? subAmount ?? 0)
      : subAmount;
    const billingCycle =
      row.billingCycle != null
        ? normalizeBillingCycle(row.billingCycle)
        : inferBillingCycle(amount, priceMonthly, priceYearly);
    const paidAt = isPaid
      ? row.paymentUpdatedAt ?? row.paymentCreatedAt
      : row.subscriptionPaidAt;
    const subscriptionStatus = resolveSubscriptionStatus(
      row.subscriptionDbStatus,
      row.endDate,
    );
    const paymentStatus = mapDbStatus(
      isPaid ? "completed" : String(row.paymentStatus ?? "completed"),
    ) as
      | "success"
      | "pending"
      | "failed"
      | "cancelled"
      | "refunded";

    return {
      id: String(isPaid ? row.paymentId : row.subscriptionId),
      subscriptionId: row.subscriptionId
        ? Number(row.subscriptionId)
        : undefined,
      orderId: isPaid
        ? String(row.customer_reference ?? row.order_id ?? row.paymentId)
        : `SUB-${row.subscriptionId}`,
      userId: Number(row.userId),
      userName: String(row.userName ?? "—"),
      userEmail: String(row.userEmail ?? ""),
      amount,
      currency: "EGP",
      status: paymentStatus === "pending" ? paymentStatus : "success",
      subscriptionStatus: row.subscriptionDbStatus
        ? subscriptionStatus
        : isPaid
          ? "active"
          : subscriptionStatus,
      subscriptionSource,
      method: isPaid ? mapPaymentMethod(row.payment_method) : undefined,
      billingCycle,
      planName: String(row.planName ?? "Pro"),
      gateway: isPaid ? "EasyKash" : "Admin",
      createdAt: new Date(
        isPaid ? (row.paymentCreatedAt ?? row.startDate) : row.startDate,
      ).toISOString(),
      paidAt: paidAt ? new Date(paidAt).toISOString() : null,
      subscriptionStartAt: new Date(
        row.startDate ?? row.paymentAt,
      ).toISOString(),
      subscriptionEndAt: row.endDate
        ? new Date(row.endDate).toISOString()
        : null,
      referenceId: row.easykash_ref
        ? String(row.easykash_ref)
        : row.customer_reference
          ? String(row.customer_reference)
          : undefined,
    };
  });

  return {
    transactions,
    statistics,
    pagination: {
      currentPage: page,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
      totalItems,
      itemsPerPage: limit,
    },
  };
}

async function buildPaymentAttemptsList(
  pool: Awaited<ReturnType<typeof getPool>>,
  params: {
    page: number;
    limit: number;
    offset: number;
    status: PaymentStatusFilter;
    period?: PaymentsPeriod;
    search?: string;
    priceMonthly: number;
    priceYearly: number;
    statistics: {
      totalRevenue: number;
      revenueThisMonth: number;
      successfulCount: number;
      pendingCount: number;
      failedCount: number;
      proActiveCount: number;
      paidActiveCount: number;
      adminGrantedCount: number;
      currency: string;
    };
  },
) {
  const conditions: string[] = ["p.payment_method = N'easykash'"];
  const request = pool.request();

  const dbStatus = mapDbStatusToQuery(params.status);
  if (dbStatus) {
    conditions.push("p.payment_status = @status");
    request.input("status", sql.NVarChar, dbStatus);
  }

  if (params.period && params.period !== "all") {
    const days = params.period === "7d" ? 7 : params.period === "90d" ? 90 : 30;
    conditions.push("p.created_at >= DATEADD(day, -@periodDays, SYSUTCDATETIME())");
    request.input("periodDays", sql.Int, days);
  }

  if (params.search?.trim()) {
    conditions.push(`(
      CAST(p.id AS NVARCHAR(36)) LIKE @search
      OR ISNULL(u.email, '') LIKE @search
      OR ISNULL(u.name, '') LIKE @search
    )`);
    request.input("search", sql.NVarChar, `%${params.search.trim()}%`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  request.input("offset", sql.Int, params.offset);
  request.input("limit", sql.Int, params.limit);

  const listResult = await request.query(`
    SELECT
      p.id,
      p.order_id,
      p.amount,
      p.payment_method,
      p.payment_status,
      p.customer_reference,
      p.easykash_ref,
      p.created_at,
      p.updated_at,
      o.user_id,
      u.name AS userName,
      u.email AS userEmail
    FROM payments p
    LEFT JOIN [subscriptionCheckout] o ON p.order_id = o.id
    LEFT JOIN Users u ON o.user_id = u.id
    ${whereClause}
    ORDER BY p.created_at DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);

  const countRequest = pool.request();
  if (dbStatus) countRequest.input("status", sql.NVarChar, dbStatus);
  if (params.period && params.period !== "all") {
    const days = params.period === "7d" ? 7 : params.period === "90d" ? 90 : 30;
    countRequest.input("periodDays", sql.Int, days);
  }
  if (params.search?.trim()) {
    countRequest.input("search", sql.NVarChar, `%${params.search.trim()}%`);
  }

  const countResult = await countRequest.query(`
    SELECT COUNT(*) AS total
    FROM payments p
    LEFT JOIN [subscriptionCheckout] o ON p.order_id = o.id
    LEFT JOIN Users u ON o.user_id = u.id
    ${whereClause}
  `);

  const totalItems = Number(countResult.recordset[0]?.total ?? 0);

  const transactions = listResult.recordset.map((row) => {
    const amount = Number(row.amount ?? 0);
    const status = mapDbStatus(row.payment_status) as
      | "success"
      | "pending"
      | "failed"
      | "cancelled"
      | "refunded";
    const paidAt =
      status === "success" ? row.updated_at ?? row.created_at : null;

    return {
      id: String(row.id),
      orderId: String(row.customer_reference ?? row.order_id ?? row.id),
      userId: Number(row.user_id ?? 0),
      userName: String(row.userName ?? "—"),
      userEmail: String(row.userEmail ?? ""),
      amount,
      currency: "EGP",
      status,
      subscriptionSource: "paid" as const,
      method: mapPaymentMethod(row.payment_method),
      billingCycle: inferBillingCycle(
        amount,
        params.priceMonthly,
        params.priceYearly,
      ),
      planName: "Pro",
      gateway: "EasyKash",
      createdAt: new Date(row.created_at).toISOString(),
      paidAt: paidAt ? new Date(paidAt).toISOString() : null,
      referenceId: row.easykash_ref
        ? String(row.easykash_ref)
        : row.customer_reference
          ? String(row.customer_reference)
          : undefined,
    };
  });

  return {
    transactions,
    statistics: params.statistics,
    pagination: {
      currentPage: params.page,
      totalPages: Math.max(1, Math.ceil(totalItems / params.limit)),
      totalItems,
      itemsPerPage: params.limit,
    },
  };
}
