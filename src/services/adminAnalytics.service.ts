import { getPool, sql } from "../config/database";
import {
  AnalyticsPeriod,
  computeCtr,
  periodToDays,
} from "../utils/analyticsPeriod";

export async function buildAdminAnalyticsResponse(period: AnalyticsPeriod) {
  const pool = await getPool();
  const days = periodToDays(period);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);

  const [
    summaryRow,
    topMenus,
    topProducts,
    viewsOverTime,
    revenueOverTime,
    adMetricsRow,
    freeBannerRow,
    topBannerMenus,
  ] = await Promise.all([
    fetchSummary(pool, days),
    fetchTopMenus(pool, days),
    fetchTopProducts(pool, days),
    fetchViewsOverTime(pool, days),
    fetchRevenueOverTime(pool),
    fetchAdMetrics(pool),
    fetchFreeBannerTotals(pool, since),
    fetchTopMenusByBannerClicks(pool, since),
  ]);

  const freeImpressions = Number(freeBannerRow?.impressions ?? 0);
  const freeClicks = Number(freeBannerRow?.clicks ?? 0);

  return {
    summary: summaryRow,
    topMenus,
    topProducts,
    viewsOverTime,
    revenueOverTime,
    adMetrics: {
      totalImpressions: Number(adMetricsRow?.impressions ?? 0),
      totalClicks: Number(adMetricsRow?.clicks ?? 0),
      averageCtr: computeCtr(
        Number(adMetricsRow?.clicks ?? 0),
        Number(adMetricsRow?.impressions ?? 0),
      ),
    },
    freeBannerMetrics: {
      totalImpressions: freeImpressions,
      totalClicks: freeClicks,
      averageCtr: computeCtr(freeClicks, freeImpressions),
      topMenusByClicks: topBannerMenus,
    },
  };
}

async function fetchSummary(pool: Awaited<ReturnType<typeof getPool>>, days: number) {
  const result = await pool
    .request()
    .input("days", sql.Int, days)
    .query(`
      DECLARE @since DATETIME2 = DATEADD(day, -@days, SYSUTCDATETIME());
      DECLARE @weekStart DATETIME2 = DATEADD(day, -7, SYSUTCDATETIME());
      DECLARE @todayStart DATETIME2 = CAST(CAST(SYSUTCDATETIME() AS DATE) AS DATETIME2);
      DECLARE @inactiveSince DATETIME2 = DATEADD(day, -30, SYSUTCDATETIME());
      DECLARE @expiringEnd DATETIME2 = DATEADD(day, 7, SYSUTCDATETIME());

      SELECT
        (SELECT COUNT(*) FROM MenuViewEvents) AS totalMenuViews,
        (SELECT COUNT(*) FROM MenuViewEvents WHERE viewedAt >= @todayStart) AS menuViewsToday,
        (SELECT COUNT(*) FROM MenuViewEvents WHERE viewedAt >= @weekStart) AS menuViewsThisWeek,
        (SELECT COUNT(*) FROM MenuOrders) AS totalOrders,
        (SELECT COUNT(*) FROM Menus WHERE isActive = 1) AS activeMenus,
        (SELECT COUNT(*) FROM Menus WHERE isActive = 0) AS inactiveMenus,
        (SELECT COUNT(*) FROM Users u WHERE u.role = 'user'
          AND NOT EXISTS (SELECT 1 FROM Menus m WHERE m.userId = u.id)) AS usersWithoutMenu,
        (SELECT COUNT(DISTINCT s.userId) FROM Subscriptions s
          INNER JOIN Plans p ON s.planId = p.id
          WHERE s.status = 'active' AND (s.endDate IS NULL OR s.endDate > GETDATE())
            AND ISNULL(p.priceMonthly, 0) = 0) AS freeUsers,
        (SELECT COUNT(DISTINCT s.userId) FROM Subscriptions s
          INNER JOIN Plans p ON s.planId = p.id
          WHERE s.status = 'active' AND (s.endDate IS NULL OR s.endDate > GETDATE())
            AND ISNULL(p.priceMonthly, 0) > 0) AS proUsers,
        (SELECT COUNT(DISTINCT s.userId) FROM Subscriptions s
          WHERE s.status = 'active' AND s.endDate IS NOT NULL
            AND s.endDate > GETDATE() AND s.endDate <= @expiringEnd) AS expiringSubscriptions,
        (SELECT COUNT(*) FROM Users u WHERE u.role = 'user'
          AND (u.lastLoginAt IS NULL OR u.lastLoginAt < @inactiveSince)) AS inactiveUsers30d
    `);

  const row = result.recordset[0] ?? {};
  const freeUsers = Number(row.freeUsers ?? 0);
  const proUsers = Number(row.proUsers ?? 0);
  const totalPlanUsers = freeUsers + proUsers;
  const conversionRate =
    totalPlanUsers > 0
      ? Math.round((proUsers / totalPlanUsers) * 1000) / 10
      : 0;

  return {
    totalMenuViews: Number(row.totalMenuViews ?? 0),
    menuViewsToday: Number(row.menuViewsToday ?? 0),
    menuViewsThisWeek: Number(row.menuViewsThisWeek ?? 0),
    totalOrders: Number(row.totalOrders ?? 0),
    activeMenus: Number(row.activeMenus ?? 0),
    inactiveMenus: Number(row.inactiveMenus ?? 0),
    usersWithoutMenu: Number(row.usersWithoutMenu ?? 0),
    freeUsers,
    proUsers,
    conversionRate,
    expiringSubscriptions: Number(row.expiringSubscriptions ?? 0),
    inactiveUsers30d: Number(row.inactiveUsers30d ?? 0),
  };
}

async function fetchTopMenus(
  pool: Awaited<ReturnType<typeof getPool>>,
  days: number,
) {
  const result = await pool.request().input("days", sql.Int, days).query(`
    SELECT TOP 10
      m.id,
      m.slug,
      mtAr.name AS nameAr,
      mtEn.name AS nameEn,
      COUNT(v.id) AS views,
      u.name AS ownerName
    FROM MenuViewEvents v
    INNER JOIN Menus m ON m.id = v.menuId
    LEFT JOIN MenuTranslations mtAr ON m.id = mtAr.menuId AND mtAr.locale = 'ar'
    LEFT JOIN MenuTranslations mtEn ON m.id = mtEn.menuId AND mtEn.locale = 'en'
    LEFT JOIN Users u ON u.id = m.userId
    WHERE v.viewedAt >= DATEADD(day, -@days, SYSUTCDATETIME())
    GROUP BY m.id, m.slug, mtAr.name, mtEn.name, u.name
    ORDER BY views DESC
  `);

  return result.recordset.map((r) => ({
    id: r.id,
    slug: r.slug,
    nameAr: r.nameAr ?? undefined,
    nameEn: r.nameEn ?? undefined,
    views: Number(r.views ?? 0),
    ownerName: r.ownerName ?? undefined,
  }));
}

async function fetchTopProducts(
  pool: Awaited<ReturnType<typeof getPool>>,
  days: number,
) {
  const result = await pool.request().input("days", sql.Int, days).query(`
    SELECT TOP 10
      mi.id,
      mitAr.name AS nameAr,
      mitEn.name AS nameEn,
      COUNT(v.id) AS views,
      mtMenuAr.name AS menuName
    FROM MenuItemViewEvents v
    INNER JOIN MenuItems mi ON mi.id = v.itemId
    LEFT JOIN MenuItemTranslations mitAr ON mi.id = mitAr.menuItemId AND mitAr.locale = 'ar'
    LEFT JOIN MenuItemTranslations mitEn ON mi.id = mitEn.menuItemId AND mitEn.locale = 'en'
    LEFT JOIN MenuTranslations mtMenuAr ON mi.menuId = mtMenuAr.menuId AND mtMenuAr.locale = 'ar'
    WHERE v.viewedAt >= DATEADD(day, -@days, SYSUTCDATETIME())
    GROUP BY mi.id, mitAr.name, mitEn.name, mtMenuAr.name
    ORDER BY views DESC
  `);

  return result.recordset.map((r) => ({
    id: r.id,
    nameAr: r.nameAr ?? undefined,
    nameEn: r.nameEn ?? undefined,
    views: Number(r.views ?? 0),
    menuName: r.menuName ?? undefined,
  }));
}

async function fetchViewsOverTime(
  pool: Awaited<ReturnType<typeof getPool>>,
  days: number,
) {
  const chartDays = days <= 7 ? days : days <= 30 ? 14 : 30;
  const result = await pool.request().input("days", sql.Int, chartDays).query(`
    SELECT CAST(v.viewedAt AS DATE) AS date, COUNT(*) AS count
    FROM MenuViewEvents v
    WHERE v.viewedAt >= DATEADD(day, -@days, SYSUTCDATETIME())
    GROUP BY CAST(v.viewedAt AS DATE)
    ORDER BY date
  `);

  return result.recordset.map((r) => ({
    date:
      r.date instanceof Date
        ? r.date.toISOString().slice(0, 10)
        : String(r.date).slice(0, 10),
    count: Number(r.count ?? 0),
  }));
}

async function fetchRevenueOverTime(pool: Awaited<ReturnType<typeof getPool>>) {
  const result = await pool.request().query(`
    SELECT TOP 6
      FORMAT(ISNULL(p.updated_at, p.created_at), 'yyyy-MM') AS month,
      SUM(p.amount) AS count
    FROM payments p
    WHERE p.payment_status = 'completed'
    GROUP BY FORMAT(ISNULL(p.updated_at, p.created_at), 'yyyy-MM')
    ORDER BY month DESC
  `);

  return result.recordset
    .map((r) => ({
      month: String(r.month),
      count: Number(r.count ?? 0),
    }))
    .reverse();
}

async function fetchAdMetrics(pool: Awaited<ReturnType<typeof getPool>>) {
  const result = await pool.request().query(`
    SELECT
      ISNULL(SUM(impressionCount), 0) AS impressions,
      ISNULL(SUM(clickCount), 0) AS clicks
    FROM Ads
  `);
  return result.recordset[0] ?? { impressions: 0, clicks: 0 };
}

async function fetchFreeBannerTotals(
  pool: Awaited<ReturnType<typeof getPool>>,
  since: Date,
) {
  const result = await pool
    .request()
    .input("since", sql.DateTime2, since)
    .query(`
      SELECT
        SUM(CASE WHEN eventType = 'impression' THEN 1 ELSE 0 END) AS impressions,
        SUM(CASE WHEN eventType = 'click' THEN 1 ELSE 0 END) AS clicks
      FROM MenuBrandingEvents
      WHERE createdAt >= @since
    `);
  return result.recordset[0];
}

async function fetchTopMenusByBannerClicks(
  pool: Awaited<ReturnType<typeof getPool>>,
  since: Date,
) {
  const result = await pool
    .request()
    .input("since", sql.DateTime2, since)
    .query(`
      SELECT TOP 10
        m.id,
        m.slug,
        mtAr.name AS nameAr,
        mtEn.name AS nameEn,
        SUM(CASE WHEN b.eventType = 'click' THEN 1 ELSE 0 END) AS clicks,
        SUM(CASE WHEN b.eventType = 'impression' THEN 1 ELSE 0 END) AS impressions
      FROM MenuBrandingEvents b
      INNER JOIN Menus m ON m.id = b.menuId
      LEFT JOIN MenuTranslations mtAr ON m.id = mtAr.menuId AND mtAr.locale = 'ar'
      LEFT JOIN MenuTranslations mtEn ON m.id = mtEn.menuId AND mtEn.locale = 'en'
      WHERE b.createdAt >= @since
      GROUP BY m.id, m.slug, mtAr.name, mtEn.name
      HAVING SUM(CASE WHEN b.eventType = 'click' THEN 1 ELSE 0 END) > 0
      ORDER BY clicks DESC
    `);

  return result.recordset.map((r) => ({
    id: r.id,
    slug: r.slug,
    nameAr: r.nameAr ?? undefined,
    nameEn: r.nameEn ?? undefined,
    clicks: Number(r.clicks ?? 0),
    impressions: Number(r.impressions ?? 0),
  }));
}
