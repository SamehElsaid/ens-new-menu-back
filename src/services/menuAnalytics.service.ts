import { getPool, sql } from "../config/database";
import {
  AnalyticsPeriod,
  computeCtr,
  periodToDays,
} from "../utils/analyticsPeriod";
import { assertMenuOwnerAccess } from "../utils/menuAccess";

type OrderAction = {
  action?: string;
  status?: string;
  waiterName?: string;
  waiterRole?: string;
  time?: string;
  actorRole?: string;
  detail?: {
    order?: {
      orderTotal?: number;
      tableNumber?: string | number;
      items?: unknown[];
    };
  };
};

type ParsedOrderItem = {
  menuItemId: number;
  name: string;
  quantity: number;
};

type ParsedOrderJson = {
  orderTotal: number;
  tableNumber?: string;
  items: ParsedOrderItem[];
};

function normalizeAction(action?: string): string {
  return String(action ?? "").trim().toUpperCase();
}

function isStaffHandledAction(action?: string): boolean {
  const key = normalizeAction(action);
  return (
    key === "TABLE_CALL_CONFIRMED" ||
    key === "TABLE_CALL_ITEMS_UPDATED" ||
    key === "TABLE_CALL_UPDATED"
  );
}

/** Named actor that is not a guest (supports legacy rows without actorRole). */
function isStaffActor(action: OrderAction): boolean {
  const name = String(action.waiterName ?? "").trim();
  if (!name) return false;
  const role = String(
    action.actorRole ?? action.waiterRole ?? "",
  ).toLowerCase();
  if (role === "guest" || role === "unknown") return false;
  return true;
}

function parseOrderItemsFromArray(raw: unknown): ParsedOrderItem[] {
  const items: ParsedOrderItem[] = [];
  if (!Array.isArray(raw)) return items;
  for (const rawItem of raw) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const it = rawItem as {
      menuItemId?: unknown;
      name?: unknown;
      quantity?: unknown;
    };
    const menuItemId = Number(it.menuItemId);
    if (!Number.isFinite(menuItemId) || menuItemId <= 0) continue;
    const qty = Number(it.quantity);
    items.push({
      menuItemId: Math.floor(menuItemId),
      name: String(it.name ?? "").trim() || `Item ${menuItemId}`,
      quantity: Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1,
    });
  }
  return items;
}

function parseActionsJson(raw: string | null | undefined): OrderAction[] {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseOrderJson(raw: string | null | undefined): ParsedOrderJson {
  try {
    const o = raw ? JSON.parse(raw) : {};
    if (!o || typeof o !== "object") {
      return { orderTotal: 0, items: [] };
    }
    const rec = o as {
      orderTotal?: unknown;
      tableNumber?: unknown;
      items?: unknown;
    };
    const total = Number(rec.orderTotal ?? 0);
    const items = parseOrderItemsFromArray(rec.items);
    const tableNumber =
      rec.tableNumber != null && String(rec.tableNumber).trim() !== ""
        ? String(rec.tableNumber).trim()
        : undefined;
    return {
      orderTotal: Number.isFinite(total) && total > 0 ? total : 0,
      tableNumber,
      items,
    };
  } catch {
    return { orderTotal: 0, items: [] };
  }
}

function mergeOrderFromConfirm(
  order: ParsedOrderJson,
  confirmAction: OrderAction,
): ParsedOrderJson {
  const detailOrder = confirmAction.detail?.order;
  const merged: ParsedOrderJson = {
    orderTotal: order.orderTotal,
    tableNumber: order.tableNumber,
    items: [...order.items],
  };
  if (!detailOrder || typeof detailOrder !== "object") return merged;

  const detailTotal = Number(detailOrder.orderTotal ?? 0);
  if (Number.isFinite(detailTotal) && detailTotal > 0) {
    merged.orderTotal = detailTotal;
  }
  if (!merged.tableNumber && detailOrder.tableNumber != null) {
    const tn = String(detailOrder.tableNumber).trim();
    if (tn) merged.tableNumber = tn;
  }
  if (merged.items.length === 0) {
    merged.items = parseOrderItemsFromArray(detailOrder.items);
  }
  return merged;
}

function findStaffConfirmation(
  actions: OrderAction[],
  row: { updatedAt?: Date | string | null },
  fetchSinceMs: number,
): { action: OrderAction; atMs: number } | null {
  let best: { action: OrderAction; atMs: number } | null = null;

  for (const a of actions) {
    if (normalizeAction(a.action) !== "TABLE_CALL_CONFIRMED") continue;

    const hasName = String(a.waiterName ?? "").trim().length > 0;
    const status = String(a.status ?? "").toLowerCase();
    const isConfirm =
      isStaffActor(a) || (hasName && (status === "confirmed" || status === ""));

    if (!isConfirm) continue;

    let atMs = a.time ? Date.parse(a.time) : NaN;
    if (!Number.isFinite(atMs) && row.updatedAt) {
      atMs = new Date(row.updatedAt).getTime();
    }
    if (!Number.isFinite(atMs)) continue;
    if (atMs < fetchSinceMs) continue;

    if (!best || atMs > best.atMs) {
      best = { action: a, atMs };
    }
  }

  return best;
}

function aggregateStaffPerformance(
  rows: {
    actionsJson?: string | null;
  }[],
  periodStartMs: number,
): { name: string; ordersHandled: number }[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const actions = parseActionsJson(row.actionsJson);
    const handlers = new Set<string>();

    for (const a of actions) {
      if (!isStaffHandledAction(a.action) || !isStaffActor(a)) continue;
      if (a.time) {
        const t = Date.parse(a.time);
        if (Number.isFinite(t) && t < periodStartMs) continue;
      }
      handlers.add(String(a.waiterName).trim());
    }

    for (const name of handlers) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, ordersHandled]) => ({ name, ordersHandled }))
    .sort((a, b) => b.ordersHandled - a.ordersHandled);
}

function computeChangePercent(current: number, previous: number): number {
  if (previous > 0) {
    return Math.round(((current - previous) / previous) * 1000) / 10;
  }
  return current > 0 ? 100 : 0;
}

function startOfUtcDayMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function buildRevenueOverTime(
  days: number,
  periodStartMs: number,
  byDate: Map<string, number>,
): { date: string; amount: number }[] {
  const chartDays = Math.min(days, 30);
  const points: { date: string; amount: number }[] = [];
  const end = new Date();
  for (let i = chartDays - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayMs = Date.parse(`${key}T00:00:00.000Z`);
    if (dayMs < periodStartMs) continue;
    points.push({ date: key, amount: byDate.get(key) ?? 0 });
  }
  return points;
}

async function staffTableCallsMeta(): Promise<{
  exists: boolean;
  filterSql: string;
  joinSql: string;
  selectSql: string;
}> {
  const pool = await getPool();
  const oid = await pool.request().query(`
    SELECT OBJECT_ID(N'dbo.StaffTableCalls', N'U') AS oid
  `);
  if (!oid.recordset?.[0]?.oid) {
    return {
      exists: false,
      filterSql: "",
      joinSql: "",
      selectSql: ", CAST(NULL AS NVARCHAR(50)) AS callTableNumber",
    };
  }
  return {
    exists: true,
    filterSql: `
    AND EXISTS (
      SELECT 1
      FROM dbo.StaffTableCalls stc0
      WHERE stc0.menuId = mo.menuId AND stc0.id = mo.orderId
    )`,
    joinSql: `
      LEFT JOIN dbo.StaffTableCalls stc
        ON stc.menuId = mo.menuId AND stc.id = mo.orderId`,
    selectSql: ", stc.tableNumber AS callTableNumber",
  };
}

async function fetchTableOrderAnalytics(menuId: number, days: number) {
  const empty = {
    confirmedOrdersInPeriod: 0,
    confirmedOrdersPreviousPeriod: 0,
    revenueInPeriod: 0,
    revenuePreviousPeriod: 0,
    revenueToday: 0,
    revenueThisWeek: 0,
    revenueThisMonth: 0,
    averageOrderValue: 0,
    revenueOverTime: [] as { date: string; amount: number }[],
    staffPerformance: [] as { name: string; ordersHandled: number }[],
    topOrderedItems: [] as {
      menuItemId: number;
      name: string;
      count: number;
    }[],
    topTables: [] as {
      tableNumber: string;
      orders: number;
      revenue: number;
    }[],
  };

  const pool = await getPool();
  const tableCheck = await pool.request().query(`
    SELECT OBJECT_ID(N'dbo.MenuOrders', N'U') AS oid
  `);
  if (!tableCheck.recordset[0]?.oid) return empty;

  const stcMeta = await staffTableCallsMeta();
  const fetchDays = Math.max(days * 2, 30);
  const fetchSinceMs = Date.now() - fetchDays * 24 * 60 * 60 * 1000;
  const periodStartMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const prevPeriodStartMs = Date.now() - days * 2 * 24 * 60 * 60 * 1000;
  const todayStartMs = startOfUtcDayMs(new Date());
  const weekStartMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const monthStartMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const result = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("days", sql.Int, fetchDays)
    .query(`
      SELECT
        mo.orderJson,
        mo.actionsJson,
        mo.updatedAt
        ${stcMeta.selectSql}
      FROM dbo.MenuOrders mo
      ${stcMeta.joinSql}
      WHERE mo.menuId = @menuId
        AND mo.updatedAt >= DATEADD(day, -@days, SYSUTCDATETIME())
        ${stcMeta.filterSql}
    `);

  let confirmedInPeriod = 0;
  let confirmedPrevPeriod = 0;
  let revenueInPeriod = 0;
  let revenuePrevPeriod = 0;
  let revenueToday = 0;
  let revenueThisWeek = 0;
  let revenueThisMonth = 0;
  const revenueByDate = new Map<string, number>();
  const staffCounts = new Map<string, number>();
  const orderedCounts = new Map<
    number,
    { menuItemId: number; name: string; count: number }
  >();
  const tableStats = new Map<
    string,
    { tableNumber: string; orders: number; revenue: number }
  >();

  const orderRows = result.recordset as {
    orderJson?: string | null;
    actionsJson?: string | null;
    updatedAt?: Date | string | null;
    callTableNumber?: string | null;
  }[];

  for (const row of orderRows) {
    const actions = parseActionsJson(row.actionsJson);
    const confirmation = findStaffConfirmation(actions, row, fetchSinceMs);
    if (!confirmation) continue;

    const { action: confirmAction, atMs: confirmedAtMs } = confirmation;
    let order = mergeOrderFromConfirm(
      parseOrderJson(row.orderJson),
      confirmAction,
    );
    if (!order.tableNumber && row.callTableNumber) {
      const tn = String(row.callTableNumber).trim();
      if (tn) order = { ...order, tableNumber: tn };
    }
    const orderTotal = order.orderTotal;

    if (confirmedAtMs >= periodStartMs) {
      const confirmer = String(confirmAction.waiterName ?? "").trim();
      if (confirmer) {
        staffCounts.set(confirmer, (staffCounts.get(confirmer) ?? 0) + 1);
      }

      confirmedInPeriod += 1;
      revenueInPeriod += orderTotal;
      const dateKey = new Date(confirmedAtMs).toISOString().slice(0, 10);
      revenueByDate.set(
        dateKey,
        (revenueByDate.get(dateKey) ?? 0) + orderTotal,
      );

      for (const item of order.items) {
        const existing = orderedCounts.get(item.menuItemId);
        if (existing) {
          existing.count += item.quantity;
        } else {
          orderedCounts.set(item.menuItemId, {
            menuItemId: item.menuItemId,
            name: item.name,
            count: item.quantity,
          });
        }
      }

      if (order.tableNumber) {
        const tbl = tableStats.get(order.tableNumber) ?? {
          tableNumber: order.tableNumber,
          orders: 0,
          revenue: 0,
        };
        tbl.orders += 1;
        tbl.revenue += orderTotal;
        tableStats.set(order.tableNumber, tbl);
      }
    } else if (
      confirmedAtMs >= prevPeriodStartMs &&
      confirmedAtMs < periodStartMs
    ) {
      confirmedPrevPeriod += 1;
      revenuePrevPeriod += orderTotal;
    }

    if (confirmedAtMs >= todayStartMs) revenueToday += orderTotal;
    if (confirmedAtMs >= weekStartMs) revenueThisWeek += orderTotal;
    if (confirmedAtMs >= monthStartMs) revenueThisMonth += orderTotal;
  }

  let staffPerformance = [...staffCounts.entries()]
    .map(([name, ordersHandled]) => ({ name, ordersHandled }))
    .sort((a, b) => b.ordersHandled - a.ordersHandled);

  if (staffPerformance.length === 0) {
    staffPerformance = aggregateStaffPerformance(orderRows, periodStartMs);
  }

  const averageOrderValue =
    confirmedInPeriod > 0
      ? Math.round(revenueInPeriod / confirmedInPeriod)
      : 0;

  const topOrderedItems = [...orderedCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const topTables = [...tableStats.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  return {
    confirmedOrdersInPeriod: confirmedInPeriod,
    confirmedOrdersPreviousPeriod: confirmedPrevPeriod,
    revenueInPeriod,
    revenuePreviousPeriod: revenuePrevPeriod,
    revenueToday,
    revenueThisWeek,
    revenueThisMonth,
    averageOrderValue,
    revenueOverTime: buildRevenueOverTime(days, periodStartMs, revenueByDate),
    staffPerformance,
    topOrderedItems,
    topTables,
  };
}

export async function buildMenuAnalyticsResponse(
  menuId: number,
  userId: number,
  role: string,
  period: AnalyticsPeriod,
) {
  await assertMenuOwnerAccess(menuId, userId, role);

  const pool = await getPool();
  const days = periodToDays(period);

  const menuRow = await pool.request().input("menuId", sql.Int, menuId).query(`
    SELECT ISNULL(viewCount, 0) AS viewCount, ISNULL(currency, 'EGP') AS currency
    FROM Menus WHERE id = @menuId
  `);

  const viewCount = Number(menuRow.recordset[0]?.viewCount ?? 0);
  const currency = String(menuRow.recordset[0]?.currency ?? "EGP");

  const summaryResult = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("days", sql.Int, days)
    .query(`
      DECLARE @todayStart DATETIME2 = CAST(CAST(SYSUTCDATETIME() AS DATE) AS DATETIME2);
      DECLARE @weekStart DATETIME2 = DATEADD(day, -7, SYSUTCDATETIME());
      DECLARE @since DATETIME2 = DATEADD(day, -@days, SYSUTCDATETIME());

      SELECT
        (SELECT COUNT(*) FROM MenuViewEvents WHERE menuId = @menuId) AS totalViews,
        (SELECT COUNT(*) FROM MenuViewEvents WHERE menuId = @menuId AND viewedAt >= @todayStart) AS viewsToday,
        (SELECT COUNT(*) FROM MenuViewEvents WHERE menuId = @menuId AND viewedAt >= @weekStart) AS viewsThisWeek
    `);

  const s = summaryResult.recordset[0] ?? {};
  const totalViews = Number(s.totalViews ?? viewCount);
  const tableOrders = await fetchTableOrderAnalytics(menuId, days);
  const totalOrders = tableOrders.confirmedOrdersInPeriod;
  const conversionRate =
    totalViews > 0
      ? Math.round((totalOrders / totalViews) * 1000) / 10
      : 0;

  const topItems = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("days", sql.Int, days)
    .query(`
      SELECT TOP 8
        mi.id,
        mitAr.name AS nameAr,
        mitEn.name AS nameEn,
        mi.image AS imageUrl,
        COUNT(v.id) AS views
      FROM MenuItemViewEvents v
      INNER JOIN MenuItems mi ON mi.id = v.itemId AND mi.menuId = @menuId
      LEFT JOIN MenuItemTranslations mitAr ON mi.id = mitAr.menuItemId AND mitAr.locale = 'ar'
      LEFT JOIN MenuItemTranslations mitEn ON mi.id = mitEn.menuItemId AND mitEn.locale = 'en'
      WHERE v.menuId = @menuId AND v.viewedAt >= DATEADD(day, -@days, SYSUTCDATETIME())
      GROUP BY mi.id, mitAr.name, mitEn.name, mi.image
      ORDER BY views DESC
    `);

  const viewsOverTime = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("days", sql.Int, Math.min(days, 30))
    .query(`
      SELECT CAST(viewedAt AS DATE) AS date, COUNT(*) AS count
      FROM MenuViewEvents
      WHERE menuId = @menuId AND viewedAt >= DATEADD(day, -@days, SYSUTCDATETIME())
      GROUP BY CAST(viewedAt AS DATE)
      ORDER BY date
    `);

  const adMetrics = await pool.request().input("menuId", sql.Int, menuId).query(`
    SELECT
      ISNULL(SUM(impressionCount), 0) AS impressions,
      ISNULL(SUM(clickCount), 0) AS clicks
    FROM Ads
    WHERE menuId = @menuId
  `);

  const adRow = adMetrics.recordset[0] ?? {};
  const adImpressions = Number(adRow.impressions ?? 0);
  const adClicks = Number(adRow.clicks ?? 0);

  const prevPeriodViews = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("days", sql.Int, days * 2)
  .query(`
    SELECT
      SUM(CASE WHEN viewedAt >= DATEADD(day, -@days, SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS currentViews,
      SUM(CASE WHEN viewedAt >= DATEADD(day, -@days * 2, SYSUTCDATETIME())
        AND viewedAt < DATEADD(day, -@days, SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS previousViews
    FROM MenuViewEvents
    WHERE menuId = @menuId AND viewedAt >= DATEADD(day, -@days * 2, SYSUTCDATETIME())
  `);

  const curV = Number(prevPeriodViews.recordset[0]?.currentViews ?? 0);
  const prevV = Number(prevPeriodViews.recordset[0]?.previousViews ?? 0);
  const viewsChangePercent =
    prevV > 0 ? Math.round(((curV - prevV) / prevV) * 1000) / 10 : curV > 0 ? 100 : 0;

  return {
    period,
    summary: {
      totalViews,
      viewsToday: Number(s.viewsToday ?? 0),
      viewsThisWeek: Number(s.viewsThisWeek ?? 0),
      totalOrders,
      conversionRate,
      revenueToday: tableOrders.revenueToday,
      revenueThisWeek: tableOrders.revenueThisWeek,
      revenueThisMonth: tableOrders.revenueThisMonth,
      averageOrderValue: tableOrders.averageOrderValue,
      currency,
    },
    comparison: {
      viewsChangePercent,
      ordersChangePercent: computeChangePercent(
        tableOrders.confirmedOrdersInPeriod,
        tableOrders.confirmedOrdersPreviousPeriod,
      ),
      revenueChangePercent: computeChangePercent(
        tableOrders.revenueInPeriod,
        tableOrders.revenuePreviousPeriod,
      ),
    },
    topVisitedItems: topItems.recordset.map((r) => ({
      id: r.id,
      nameAr: r.nameAr ?? undefined,
      nameEn: r.nameEn ?? undefined,
      views: Number(r.views ?? 0),
      imageUrl: r.imageUrl ?? undefined,
    })),
    viewsOverTime: viewsOverTime.recordset.map((r) => ({
      date:
        r.date instanceof Date
          ? r.date.toISOString().slice(0, 10)
          : String(r.date).slice(0, 10),
      count: Number(r.count ?? 0),
    })),
    revenueOverTime: tableOrders.revenueOverTime,
    topOrderedItems: tableOrders.topOrderedItems,
    topTables: tableOrders.topTables,
    adMetrics: {
      totalImpressions: adImpressions,
      totalClicks: adClicks,
      averageCtr: computeCtr(adClicks, adImpressions),
    },
    staffPerformance: tableOrders.staffPerformance,
  };
}
