import type { Request } from "express";
import { getPool, sql } from "../config/database";
import { ROLES } from "../config/constants";
import {
  getMenuStaffColumnMeta,
  quoteMenuStaffIdent,
} from "../config/menuStaffColumns";
/** Legacy `role` text normalizer (transition only; RBAC uses role names). */
function normalizeLegacyStaffRole(input: unknown): string | null {
  if (input == null || input === "") return null;
  const s = String(input).trim().toLowerCase();
  if (s === "casher") return "cashier";
  if (s === "cashier" || s === "waiter") return s;
  return null;
}
import { authorization } from "./authorization.service";
import { actorFromRequest } from "../middleware/requireStaffPermission";
import { ensureMenuAuditLogSchema } from "../schemas/menuAuditLog.schema";
import { ensureStaffTableCallsOrderTypeSchema } from "../schemas/staffTableCallsOrderType.schema";
import type { TokenPayload } from "../utils/tokenHelper";
import { logger } from "../utils/logger";
import { broadcastMenuActivityUpdated } from "../socket/staffIoBroadcast";
import {
  buildSqlIntInList,
  getDeliveryGroupMenuIds,
} from "./menuGroup.service";
import {
  advanceStaffTableCallStatus,
  attachMenuChargeFieldsToOrder,
  completeStaffTableCall,
  getStaffTableCallSnapshot,
  setStaffTableCallStatus,
  updateStaffTableCallItems,
  type StaffTableCallRow,
} from "./staffTableCall.service";

export type MenuActivityInsert = {
  action: string;
  targetType?: string | null;
  targetId?: number | null;
  summaryAr: string;
  summaryEn: string;
  detailJson?: string | null;
};

type MenuOrderActor = {
  actorRole: string;
  actorName: string;
  staffJobRole: string | null;
};

type ParsedDetail = {
  status?: string;
  order?: Record<string, unknown>;
  [key: string]: unknown;
};

function pickActorStaffJobFromRow(r: Record<string, unknown>): string | null {
  const v =
    r.actorStaffJobRole ??
    r.ActorStaffJobRole ??
    (r as { actorstaffjobrole?: unknown }).actorstaffjobrole;
  if (v == null || String(v).trim() === "") return null;
  return String(v).trim();
}

function actorStaffJobFromDetailJson(detailJson: unknown): string | null {
  if (detailJson == null || typeof detailJson !== "string") return null;
  try {
    const o = JSON.parse(detailJson) as { actorStaffJobRole?: unknown };
    if (
      o.actorStaffJobRole != null &&
      String(o.actorStaffJobRole).trim() !== ""
    ) {
      return String(o.actorStaffJobRole).trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

function parseDetailJson(detailJson: string | null | undefined): ParsedDetail {
  if (!detailJson) return {};
  try {
    const parsed = JSON.parse(detailJson) as ParsedDetail;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* ignore */
  }
  return {};
}

function inferStatus(action: string, detail: ParsedDetail): string {
  const statusRaw =
    typeof detail.status === "string" ? detail.status.trim().toLowerCase() : "";
  if (statusRaw) return statusRaw;
  if (action === "TABLE_CALL_CONFIRMED") return "confirmed";
  if (action === "TABLE_CALL_CANCELLED") return "cancelled";
  if (action === "TABLE_CALL_PREPARED") return "prepared";
  if (action === "TABLE_CALL_DELIVERED") return "delivered";
  if (action === "TABLE_CALL_COMPLETED") return "delivered";
  if (action === "TABLE_CALL_CREATED") return "pending";
  if (action === "TABLE_CALL_BILL_REQUESTED") {
    return statusRaw || "updated";
  }
  if (
    action === "TABLE_CALL_ITEMS_UPDATED" ||
    action === "TABLE_CALL_UPDATED"
  ) {
    return "updated";
  }
  return action;
}

async function appendMenuOrderActivity(
  menuId: number,
  orderId: number,
  actor: MenuOrderActor,
  row: MenuActivityInsert,
): Promise<void> {
  const pool = await getPool();
  const detailObj = parseDetailJson(row.detailJson);
  const orderObj =
    detailObj.order && typeof detailObj.order === "object"
      ? detailObj.order
      : {};
  const nowIso = new Date().toISOString();
  const actionPayload = {
    action: row.action,
    status: inferStatus(row.action, detailObj),
    waiterName: actor.actorName,
    waiterRole: actor.staffJobRole ?? actor.actorRole,
    actorRole: actor.actorRole,
    actorStaffJobRole: actor.staffJobRole,
    time: nowIso,
    summaryAr: row.summaryAr,
    summaryEn: row.summaryEn,
    detail: detailObj,
  };

  const existing = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("orderId", sql.Int, orderId).query(`
      SELECT id, orderJson, actionsJson
      FROM dbo.MenuOrders
      WHERE menuId = @menuId AND orderId = @orderId
    `);

  if ((existing.recordset?.length ?? 0) === 0) {
    await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("orderId", sql.Int, orderId)
      .input("orderJson", sql.NVarChar(sql.MAX), JSON.stringify(orderObj))
      .input(
        "actionsJson",
        sql.NVarChar(sql.MAX),
        JSON.stringify([actionPayload]),
      ).query(`
        INSERT INTO dbo.MenuOrders (menuId, orderId, orderJson, actionsJson, updatedAt)
        VALUES (@menuId, @orderId, @orderJson, @actionsJson, SYSUTCDATETIME())
      `);
    broadcastMenuActivityUpdated(menuId);
    return;
  }

  const row0 = existing.recordset[0] as {
    orderJson?: string | null;
    actionsJson?: string | null;
  };
  let prevActions: unknown[] = [];
  try {
    const parsed = row0.actionsJson ? JSON.parse(row0.actionsJson) : [];
    prevActions = Array.isArray(parsed) ? parsed : [];
  } catch {
    prevActions = [];
  }
  const mergedActions = [...prevActions, actionPayload];
  let mergedOrder = orderObj;
  if (Object.keys(mergedOrder).length === 0) {
    try {
      mergedOrder = row0.orderJson
        ? (JSON.parse(row0.orderJson) as Record<string, unknown>)
        : {};
    } catch {
      mergedOrder = {};
    }
  }
  await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("orderId", sql.Int, orderId)
    .input("orderJson", sql.NVarChar(sql.MAX), JSON.stringify(mergedOrder))
    .input("actionsJson", sql.NVarChar(sql.MAX), JSON.stringify(mergedActions))
    .query(`
      UPDATE dbo.MenuOrders
      SET orderJson = @orderJson, actionsJson = @actionsJson, updatedAt = SYSUTCDATETIME()
      WHERE menuId = @menuId AND orderId = @orderId
    `);
  broadcastMenuActivityUpdated(menuId);
}

export async function resolveActorForLog(req: Request): Promise<{
  actorRole: string;
  actorName: string;
  staffJobRole: string | null;
}> {
  const u = req.user as TokenPayload | undefined;
  if (!u) {
    return { actorRole: "unknown", actorName: "?", staffJobRole: null };
  }

  try {
    const pool = await getPool();
    if (u.role === ROLES.STAFF) {
      const meta = await getMenuStaffColumnMeta();
      const nameCol = quoteMenuStaffIdent(meta.nameKey);
      // Prefer the RBAC role name; fall back to the legacy `role` text column.
      const roleNameSql = meta.roleIdColumnQuoted ? `, r.name AS roleName` : "";
      const legacyRoleSql = meta.roleColumnQuoted
        ? `, s.${meta.roleColumnQuoted} AS jobRole`
        : "";
      const joinRoles = meta.roleIdColumnQuoted
        ? `LEFT JOIN dbo.MenuStaffRoles r ON r.id = s.${meta.roleIdColumnQuoted}`
        : "";
      const r = await pool
        .request()
        .input("id", sql.Int, u.userId)
        .query(
          `SELECT s.${nameCol} AS displayName${roleNameSql}${legacyRoleSql} FROM MenuStaff s ${joinRoles} WHERE s.id = @id`,
        );
      const row = r.recordset[0] as Record<string, unknown> | undefined;
      const name = row?.displayName ?? row?.DisplayName;
      const label =
        name != null && String(name).trim() !== ""
          ? String(name).trim()
          : (u.email ?? "Staff");
      const roleName = row?.roleName ?? row?.RoleName;
      const legacyJob = row?.jobRole ?? row?.JobRole;
      const staffJobRole =
        roleName != null && String(roleName).trim() !== ""
          ? String(roleName).trim()
          : legacyJob != null
            ? normalizeLegacyStaffRole(legacyJob)
            : null;
      return { actorRole: ROLES.STAFF, actorName: label, staffJobRole };
    }

    const r = await pool
      .request()
      .input("id", sql.Int, u.userId)
      .query(`SELECT name, email FROM Users WHERE id = @id`);
    const row = r.recordset[0] as
      | { name?: string | null; email?: string | null }
      | undefined;
    const label =
      row?.name != null && String(row.name).trim() !== ""
        ? String(row.name).trim()
        : row?.email != null
          ? String(row.email)
          : u.role || "User";
    return {
      actorRole: String(u.role || ROLES.USER),
      actorName: label,
      staffJobRole: null,
    };
  } catch (e) {
    logger.warn("resolveActorForLog failed", e);
    return {
      actorRole: String(u.role ?? "user"),
      actorName: u.email ?? "?",
      staffJobRole: null,
    };
  }
}

/**
 * Non-blocking: failures are logged, never thrown.
 */
async function appendMenuAuditLog(
  menuId: number,
  actor: MenuOrderActor,
  row: MenuActivityInsert,
): Promise<void> {
  await ensureMenuAuditLogSchema();
  const pool = await getPool();
  await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("action", sql.NVarChar, row.action)
    .input("targetType", sql.NVarChar, String(row.targetType ?? ""))
    .input(
      "targetId",
      sql.Int,
      Number.isFinite(row.targetId ?? NaN) ? row.targetId : null,
    )
    .input("summaryAr", sql.NVarChar, row.summaryAr)
    .input("summaryEn", sql.NVarChar, row.summaryEn)
    .input("detailJson", sql.NVarChar(sql.MAX), row.detailJson ?? null)
    .input("actorRole", sql.NVarChar, actor.actorRole)
    .input("actorName", sql.NVarChar, actor.actorName)
    .query(`
      INSERT INTO dbo.MenuAuditLog (
        menuId, action, targetType, targetId,
        summaryAr, summaryEn, detailJson, actorRole, actorName
      )
      VALUES (
        @menuId, @action, @targetType, @targetId,
        @summaryAr, @summaryEn, @detailJson, @actorRole, @actorName
      )
    `);
  broadcastMenuActivityUpdated(menuId);
}

export async function logMenuActivitySafe(
  req: Request,
  menuId: number,
  row: MenuActivityInsert,
): Promise<void> {
  try {
    if (!Number.isFinite(menuId) || menuId <= 0) return;

    const targetType = String(row.targetType ?? "")
      .trim()
      .toLowerCase();

    if (targetType === "table_call") {
      if (!Number.isFinite(row.targetId ?? NaN) || (row.targetId ?? 0) <= 0)
        return;
      const actor = await resolveActorForLog(req);
      const orderId = Number(row.targetId);
      await appendMenuOrderActivity(menuId, orderId, actor, row);
      return;
    }

    const actor = await resolveActorForLog(req);
    await appendMenuAuditLog(menuId, actor, row);
  } catch (e) {
    logger.warn("logMenuActivitySafe skipped", e);
  }
}

/** For guest-created orders where no authenticated req.user exists. */
export async function logMenuOrderEventSafe(
  menuId: number,
  orderId: number,
  row: MenuActivityInsert,
  actor?: {
    actorName?: string | null;
    actorRole?: string | null;
    staffJobRole?: string | null;
  },
): Promise<void> {
  try {
    if (!Number.isFinite(menuId) || menuId <= 0) return;
    if (!Number.isFinite(orderId) || orderId <= 0) return;
    const safeActor: MenuOrderActor = {
      actorRole: String(actor?.actorRole ?? "guest"),
      actorName: String(actor?.actorName ?? "Guest"),
      staffJobRole: actor?.staffJobRole ?? null,
    };
    await appendMenuOrderActivity(menuId, orderId, safeActor, row);
  } catch (e) {
    logger.warn("logMenuOrderEventSafe skipped", e);
  }
}

function sanitizeActorNameSearch(
  raw: string | undefined | null,
): string | null {
  if (raw == null) return null;
  const t = String(raw).trim().slice(0, 100);
  if (t.length === 0) return null;
  return t.replace(/[%_\[\]]/g, "");
}

async function buildMenuOrderSearchCondition(
  pool: Awaited<ReturnType<typeof getPool>>,
  nameFilter: string | null,
  rowsReq: ReturnType<Awaited<ReturnType<typeof getPool>>["request"]>,
  countReq: ReturnType<Awaited<ReturnType<typeof getPool>>["request"]>,
): Promise<string> {
  if (nameFilter == null) return "";

  rowsReq.input("nameFilter", sql.NVarChar, nameFilter);
  countReq.input("nameFilter", sql.NVarChar, nameFilter);

  const stcOid = await pool.request().query(`
    SELECT OBJECT_ID(N'dbo.StaffTableCalls', N'U') AS oid
  `);
  const hasStaffTableCalls = Boolean(stcOid.recordset[0]?.oid);

  const staffSearch = hasStaffTableCalls
    ? `
      OR EXISTS (
        SELECT 1
        FROM dbo.StaffTableCalls stc_search
        WHERE stc_search.menuId = mo.menuId
          AND stc_search.id = mo.orderId
          AND (
            ISNULL(stc_search.customerAddress, N'') LIKE N'%' + @nameFilter + N'%'
            OR ISNULL(stc_search.customerPhone, N'') LIKE N'%' + @nameFilter + N'%'
            OR ISNULL(stc_search.customerName, N'') LIKE N'%' + @nameFilter + N'%'
            OR ISNULL(stc_search.tableNumber, N'') LIKE N'%' + @nameFilter + N'%'
            OR CAST(stc_search.id AS NVARCHAR(20)) LIKE N'%' + @nameFilter + N'%'
          )
      )`
    : "";

  return `
    AND (
      mo.actionsJson LIKE N'%' + @nameFilter + N'%'
      OR mo.orderJson LIKE N'%' + @nameFilter + N'%'
      ${staffSearch}
    )`;
}

/**
 * Activity history is for table orders only: `MenuOrders.orderId` must match
 * `StaffTableCalls.id`. Other features incorrectly reused `targetId` as `orderId`
 * (e.g. staff id), which polluted this feed — exclude those rows.
 */
export type MenuOrderChannel = "delivery" | "table";

export type MenuOrderListFilters = {
  channel?: MenuOrderChannel | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  status?: string | null;
};

const MENU_ORDER_STATUSES = new Set([
  "pending",
  "confirmed",
  "cancelled",
  "prepared",
  "delivered",
]);

export function parseMenuOrderDateParam(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return trimmed;
}

export function parseMenuOrderStatusParam(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const status = raw.trim().toLowerCase();
  if (!status || status === "all") return null;
  if (!MENU_ORDER_STATUSES.has(status)) return null;
  return status;
}

function bindMenuOrderListFilterParams(
  req: ReturnType<Awaited<ReturnType<typeof getPool>>["request"]>,
  filters: MenuOrderListFilters,
): string {
  let extra = "";
  if (filters.dateFrom) {
    req.input("dateFrom", sql.Date, filters.dateFrom);
    extra += " AND CAST(stc.createdAt AS DATE) >= @dateFrom";
  }
  if (filters.dateTo) {
    req.input("dateTo", sql.Date, filters.dateTo);
    extra += " AND CAST(stc.createdAt AS DATE) <= @dateTo";
  }
  if (filters.status) {
    req.input("orderStatus", sql.NVarChar, filters.status);
    extra +=
      " AND LOWER(LTRIM(RTRIM(ISNULL(stc.status, N'pending')))) = @orderStatus";
  }
  return extra;
}

async function menuOrdersTableCallExistsSql(
  filters: MenuOrderListFilters,
  bindTo?: ReturnType<Awaited<ReturnType<typeof getPool>>["request"]>,
): Promise<string> {
  await ensureStaffTableCallsOrderTypeSchema();
  const pool = await getPool();
  const oid = await pool.request().query(`
    SELECT OBJECT_ID(N'dbo.StaffTableCalls', N'U') AS oid
  `);
  if (!oid.recordset?.[0]?.oid) return "";

  const channel = filters.channel ?? null;
  let channelFilter = "";
  if (channel === "delivery") {
    channelFilter = `
      AND (
        stc.orderType = N'delivery'
        OR (
          (stc.orderType IS NULL OR LTRIM(RTRIM(stc.orderType)) = N'')
          AND LOWER(LTRIM(RTRIM(ISNULL(stc.tableNumber, N'')))) = N'delivery'
        )
      )`;
  } else if (channel === "table") {
    channelFilter = `
      AND (
        ISNULL(NULLIF(LTRIM(RTRIM(stc.orderType)), N''), N'table') = N'table'
        AND LOWER(LTRIM(RTRIM(ISNULL(stc.tableNumber, N'')))) <> N'delivery'
      )
      AND (
        stc.requestKind IS NULL
        OR LOWER(LTRIM(RTRIM(stc.requestKind))) NOT IN (N'bill', N'waiter')
      )`;
  }

  const listFilter =
    bindTo != null ? bindMenuOrderListFilterParams(bindTo, filters) : "";

  return `
    AND EXISTS (
      SELECT 1
      FROM dbo.StaffTableCalls stc
      WHERE stc.menuId = mo.menuId AND stc.id = mo.orderId
      ${channelFilter}
      ${listFilter}
    )`;
}

async function resolveMenuIdsForOrderChannel(
  menuId: number,
  channel?: MenuOrderChannel | null,
): Promise<number[]> {
  if (channel === "delivery") {
    return getDeliveryGroupMenuIds(menuId);
  }
  return [menuId];
}

function menuIdWhereSql(menuIds: number[]): string {
  if (menuIds.length === 1) {
    return "mo.menuId = @menuId";
  }
  const inList = buildSqlIntInList(menuIds);
  return inList ? `mo.menuId IN (${inList})` : "mo.menuId = @menuId";
}

export async function getMenuActivityLogById(
  menuId: number,
  id: number,
  channel?: MenuOrderChannel | null,
): Promise<{
  id: string;
  orderId: string;
  lastAction: string;
  actions: any[];
  order: any;
  items: any[];
  totalPrice: number;
  itemsSubtotal?: number | null;
  taxEnabled?: boolean;
  taxPercent?: number | null;
  taxAmount?: number | null;
  serviceEnabled?: boolean;
  servicePercent?: number | null;
  serviceAmount?: number | null;
  updatedAt: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  orderNotes?: string | null;
  governorateId?: number | null;
  governorateNameAr?: string | null;
  governorateNameEn?: string | null;
  deliveryFee?: number | null;
  sourceMenuId?: number | null;
  sourceMenuNameAr?: string | null;
  sourceMenuNameEn?: string | null;
  storageMenuId?: number;
  pendingGuestAddition?: boolean;
  pendingBillRequest?: boolean;
} | null> {
  try {
    const pool = await getPool();
    const tableCheck = await pool.request().query(`
      SELECT OBJECT_ID(N'dbo.MenuOrders', N'U') AS oid
    `);
    if (!tableCheck.recordset[0]?.oid) return null;

    let menuIds = await resolveMenuIdsForOrderChannel(menuId, channel);
    let tableCallOnly = await menuOrdersTableCallExistsSql(
      channel === "delivery" ? { channel: "delivery" } : {},
    );
    let menuFilter = menuIdWhereSql(menuIds);

    let result = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("id", sql.Int, id).query(`
        SELECT
          mo.id,
          mo.orderId,
          mo.orderJson,
          mo.actionsJson,
          mo.updatedAt,
          mo.menuId AS storageMenuId,
          stc.customerPhone,
          stc.customerAddress,
          stc.orderNotes,
          stc.orderType,
          stc.sourceMenuId
        FROM dbo.MenuOrders mo
        LEFT JOIN dbo.StaffTableCalls stc
          ON stc.menuId = mo.menuId AND stc.id = mo.orderId
        WHERE ${menuFilter} AND mo.id = @id
        ${tableCallOnly}
      `);

    if (
      !result.recordset.length &&
      channel !== "table" &&
      menuIds.length === 1
    ) {
      menuIds = await getDeliveryGroupMenuIds(menuId);
      tableCallOnly = await menuOrdersTableCallExistsSql({ channel: "delivery" });
      menuFilter = menuIdWhereSql(menuIds);
      result = await pool
        .request()
        .input("menuId", sql.Int, menuId)
        .input("id", sql.Int, id).query(`
        SELECT
          mo.id,
          mo.orderId,
          mo.orderJson,
          mo.actionsJson,
          mo.updatedAt,
          mo.menuId AS storageMenuId,
          stc.customerPhone,
          stc.customerAddress,
          stc.orderNotes,
          stc.orderType,
          stc.sourceMenuId
        FROM dbo.MenuOrders mo
        LEFT JOIN dbo.StaffTableCalls stc
          ON stc.menuId = mo.menuId AND stc.id = mo.orderId
        WHERE ${menuFilter} AND mo.id = @id
        ${tableCallOnly}
      `);
    }

    if (!result.recordset.length) return null;

    const r = result.recordset[0] as Record<string, unknown>;

    let order: any = {};
    try {
      order = r.orderJson ? JSON.parse(String(r.orderJson)) : {};
    } catch {
      /* ignore */
    }

    let actions: any[] = [];
    try {
      actions = r.actionsJson ? JSON.parse(String(r.actionsJson)) : [];
      if (!Array.isArray(actions)) actions = [];
    } catch {
      /* ignore */
    }

    const lastAction =
      actions.length > 0 ? actions[actions.length - 1].action : "";

    const stcPhone =
      r.customerPhone != null && String(r.customerPhone).trim() !== ""
        ? String(r.customerPhone).trim()
        : null;
    const stcAddress =
      r.customerAddress != null && String(r.customerAddress).trim() !== ""
        ? String(r.customerAddress).trim()
        : null;
    const stcNotes =
      r.orderNotes != null && String(r.orderNotes).trim() !== ""
        ? String(r.orderNotes).trim()
        : null;

    if (!order.customerPhone && stcPhone) order.customerPhone = stcPhone;
    if (!order.customerAddress && stcAddress) order.customerAddress = stcAddress;
    if (!order.orderNotes && stcNotes) order.orderNotes = stcNotes;

    const stcSourceMenuId =
      r.sourceMenuId != null && Number.isFinite(Number(r.sourceMenuId))
        ? Number(r.sourceMenuId)
        : null;
    if (order.sourceMenuId == null && stcSourceMenuId) {
      order.sourceMenuId = stcSourceMenuId;
    }

    return {
      id: String(r.id),
      orderId: String(r.orderId),
      lastAction: String(lastAction),
      actions,
      order,
      items: order.items || [],
      totalPrice: Number(order.orderTotal || 0),
      itemsSubtotal:
        order.itemsSubtotal != null &&
        Number.isFinite(Number(order.itemsSubtotal))
          ? Number(order.itemsSubtotal)
          : null,
      taxEnabled: order.taxEnabled === true,
      taxPercent:
        order.taxPercent != null && Number.isFinite(Number(order.taxPercent))
          ? Number(order.taxPercent)
          : null,
      taxAmount:
        order.taxAmount != null && Number.isFinite(Number(order.taxAmount))
          ? Number(order.taxAmount)
          : null,
      serviceEnabled: order.serviceEnabled === true,
      servicePercent:
        order.servicePercent != null &&
        Number.isFinite(Number(order.servicePercent))
          ? Number(order.servicePercent)
          : null,
      serviceAmount:
        order.serviceAmount != null &&
        Number.isFinite(Number(order.serviceAmount))
          ? Number(order.serviceAmount)
          : null,
      updatedAt: r.updatedAt ? String(r.updatedAt) : null,
      customerPhone: order.customerPhone ?? stcPhone,
      customerAddress: order.customerAddress ?? stcAddress,
      orderNotes: order.orderNotes ?? stcNotes,
      governorateId: order.governorateId ?? null,
      governorateNameAr: order.governorateNameAr ?? null,
      governorateNameEn: order.governorateNameEn ?? null,
      deliveryFee:
        order.deliveryFee != null && Number.isFinite(Number(order.deliveryFee))
          ? Number(order.deliveryFee)
          : null,
      sourceMenuId: order.sourceMenuId ?? stcSourceMenuId,
      sourceMenuNameAr: order.sourceMenuNameAr ?? null,
      sourceMenuNameEn: order.sourceMenuNameEn ?? null,
      storageMenuId:
        r.storageMenuId != null ? Number(r.storageMenuId) : menuId,
      pendingGuestAddition: order.pendingGuestAddition === true,
      pendingBillRequest: order.pendingBillRequest === true,
    };
  } catch (error) {
    logger.error("getMenuActivityLogById error:", error);
    return null;
  }
}

export async function listMenuActivityLogs(
  menuId: number,
  page: number,
  limit: number,
  actorNameSearch?: string | null,
  channel?: MenuOrderChannel | null,
  listFilters?: Pick<
    MenuOrderListFilters,
    "dateFrom" | "dateTo" | "status"
  > | null,
): Promise<{
  rows: any[];
  total: number;
  page: number;
  limit: number;
}> {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const offset = (safePage - 1) * safeLimit;
  const nameFilter = sanitizeActorNameSearch(actorNameSearch ?? null);

  try {
    const pool = await getPool();
    const tableCheck = await pool.request().query(`
      SELECT OBJECT_ID(N'dbo.MenuOrders', N'U') AS oid
    `);
    if (!tableCheck.recordset[0]?.oid) {
      return { rows: [], total: 0, page: safePage, limit: safeLimit };
    }

    const orderListFilters: MenuOrderListFilters = {
      channel: channel ?? null,
      dateFrom: listFilters?.dateFrom ?? null,
      dateTo: listFilters?.dateTo ?? null,
      status: listFilters?.status ?? null,
    };

    const menuIds = await resolveMenuIdsForOrderChannel(menuId, channel);
    const menuFilter = menuIdWhereSql(menuIds);

    const countReq = pool.request().input("menuId", sql.Int, menuId);
    const rowsReq = pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, safeLimit);

    const tableCallOnly = await menuOrdersTableCallExistsSql(
      orderListFilters,
      countReq,
    );
    await menuOrdersTableCallExistsSql(orderListFilters, rowsReq);

    let nameCondition = await buildMenuOrderSearchCondition(
      pool,
      nameFilter,
      rowsReq,
      countReq,
    );

    const countR = await countReq.query(`
      SELECT COUNT(*) AS c
      FROM dbo.MenuOrders mo
      WHERE ${menuFilter}
      ${tableCallOnly}
      ${nameCondition}
    `);
    const total = Number(countR.recordset[0]?.c ?? 0);

    const rowsR = await rowsReq.query(`
      SELECT
        mo.id,
        mo.orderId,
        mo.orderJson,
        mo.actionsJson,
        mo.updatedAt
      FROM dbo.MenuOrders mo
      WHERE ${menuFilter}
      ${tableCallOnly}
      ${nameCondition}
      ORDER BY mo.updatedAt DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const rows = (rowsR.recordset as Record<string, unknown>[]).map((r) => {
      let order: any = {};
      try {
        order = r.orderJson ? JSON.parse(String(r.orderJson)) : {};
      } catch (e) {}

      let actions: any[] = [];
      try {
        actions = r.actionsJson ? JSON.parse(String(r.actionsJson)) : [];
      } catch (e) {}

      const lastAction =
        actions.length > 0 ? actions[actions.length - 1].action : "";

      const actionDetails = actions.map((a) => ({
        waiterName: a.waiterName || "",
        time: a.time || "",
        status: a.status || "",
      }));

      const customerName =
        order.customerName != null && String(order.customerName).trim() !== ""
          ? String(order.customerName).trim()
          : null;

      const tableNumber =
        order.tableNumber != null && String(order.tableNumber).trim() !== ""
          ? String(order.tableNumber).trim()
          : null;

      const governorateId =
        order.governorateId != null && Number.isFinite(Number(order.governorateId))
          ? Number(order.governorateId)
          : null;

      const orderTypeRaw = String(order.type ?? order.orderChannel ?? "").trim().toLowerCase();
      const orderType =
        orderTypeRaw === "delivery" || orderTypeRaw === "table"
          ? orderTypeRaw
          : tableNumber?.toLowerCase() === "delivery"
            ? "delivery"
            : "table";

      const customerPhone =
        order.customerPhone != null && String(order.customerPhone).trim() !== ""
          ? String(order.customerPhone).trim()
          : null;

      const customerAddress =
        order.customerAddress != null &&
        String(order.customerAddress).trim() !== ""
          ? String(order.customerAddress).trim()
          : null;

      const orderNotes =
        order.orderNotes != null && String(order.orderNotes).trim() !== ""
          ? String(order.orderNotes).trim()
          : null;

      const sourceMenuId =
        order.sourceMenuId != null && Number.isFinite(Number(order.sourceMenuId))
          ? Number(order.sourceMenuId)
          : null;

      return {
        id: String(r.id),
        orderId: String(r.orderId),
        lastAction: String(lastAction),
        actionDetails: actionDetails,
        customerName,
        tableNumber,
        type: orderType,
        customerPhone,
        customerAddress,
        orderNotes,
        sourceMenuId,
        sourceMenuNameAr:
          order.sourceMenuNameAr != null
            ? String(order.sourceMenuNameAr)
            : null,
        sourceMenuNameEn:
          order.sourceMenuNameEn != null
            ? String(order.sourceMenuNameEn)
            : null,
        governorateId,
        governorateNameAr:
          order.governorateNameAr != null
            ? String(order.governorateNameAr)
            : null,
        governorateNameEn:
          order.governorateNameEn != null
            ? String(order.governorateNameEn)
            : null,
        deliveryFee:
          order.deliveryFee != null && Number.isFinite(Number(order.deliveryFee))
            ? Number(order.deliveryFee)
            : null,
        items: order.items || [],
        totalPrice: Number(order.orderTotal || 0),
        itemsSubtotal:
          order.itemsSubtotal != null &&
          Number.isFinite(Number(order.itemsSubtotal))
            ? Number(order.itemsSubtotal)
            : null,
        taxEnabled: order.taxEnabled === true,
        taxPercent:
          order.taxPercent != null && Number.isFinite(Number(order.taxPercent))
            ? Number(order.taxPercent)
            : null,
        taxAmount:
          order.taxAmount != null && Number.isFinite(Number(order.taxAmount))
            ? Number(order.taxAmount)
            : null,
        serviceEnabled: order.serviceEnabled === true,
        servicePercent:
          order.servicePercent != null &&
          Number.isFinite(Number(order.servicePercent))
            ? Number(order.servicePercent)
            : null,
        serviceAmount:
          order.serviceAmount != null &&
          Number.isFinite(Number(order.serviceAmount))
            ? Number(order.serviceAmount)
            : null,
        pendingGuestAddition: order.pendingGuestAddition === true,
        pendingBillRequest: order.pendingBillRequest === true,
      };
    });

    return { rows, total, page: safePage, limit: safeLimit };
  } catch (error) {
    logger.error("listMenuActivityLogs error:", error);
    return { rows: [], total: 0, page: safePage, limit: safeLimit };
  }
}

export type MenuAuditLogRow = {
  id: string;
  action: string;
  targetType: string;
  targetId: number | null;
  summaryAr: string;
  summaryEn: string;
  actorRole: string;
  actorName: string;
  createdAt: string;
};

export async function listMenuAuditLogs(
  menuId: number,
  page: number,
  limit: number,
  search?: string | null,
): Promise<{
  rows: MenuAuditLogRow[];
  total: number;
  page: number;
  limit: number;
}> {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
  const offset = (safePage - 1) * safeLimit;
  const nameFilter = sanitizeActorNameSearch(search ?? null);

  try {
    await ensureMenuAuditLogSchema();
    const pool = await getPool();

    const tableCheck = await pool.request().query(`
      SELECT OBJECT_ID(N'dbo.MenuAuditLog', N'U') AS oid
    `);
    if (!tableCheck.recordset[0]?.oid) {
      return { rows: [], total: 0, page: safePage, limit: safeLimit };
    }

    const countReq = pool.request().input("menuId", sql.Int, menuId);
    const rowsReq = pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, safeLimit);

    let searchCondition = "";
    if (nameFilter != null) {
      countReq.input("searchFilter", sql.NVarChar, nameFilter);
      rowsReq.input("searchFilter", sql.NVarChar, nameFilter);
      searchCondition = `
        AND (
          mal.summaryAr LIKE N'%' + @searchFilter + N'%'
          OR mal.summaryEn LIKE N'%' + @searchFilter + N'%'
          OR mal.action LIKE N'%' + @searchFilter + N'%'
          OR mal.actorName LIKE N'%' + @searchFilter + N'%'
        )`;
    }

    const countR = await countReq.query(`
      SELECT COUNT(*) AS c
      FROM dbo.MenuAuditLog mal
      WHERE mal.menuId = @menuId
      ${searchCondition}
    `);
    const total = Number(countR.recordset[0]?.c ?? 0);

    const rowsR = await rowsReq.query(`
      SELECT
        mal.id,
        mal.action,
        mal.targetType,
        mal.targetId,
        mal.summaryAr,
        mal.summaryEn,
        mal.actorRole,
        mal.actorName,
        mal.createdAt
      FROM dbo.MenuAuditLog mal
      WHERE mal.menuId = @menuId
      ${searchCondition}
      ORDER BY mal.createdAt DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const rows = (rowsR.recordset as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      action: String(r.action ?? ""),
      targetType: String(r.targetType ?? ""),
      targetId:
        r.targetId != null && Number.isFinite(Number(r.targetId))
          ? Number(r.targetId)
          : null,
      summaryAr: String(r.summaryAr ?? ""),
      summaryEn: String(r.summaryEn ?? ""),
      actorRole: String(r.actorRole ?? ""),
      actorName: String(r.actorName ?? ""),
      createdAt: r.createdAt ? String(r.createdAt) : "",
    }));

    return { rows, total, page: safePage, limit: safeLimit };
  } catch (error) {
    logger.error("listMenuAuditLogs error:", error);
    return { rows: [], total: 0, page: safePage, limit: safeLimit };
  }
}

export type MenuOrderActionType =
  | "TABLE_CALL_CONFIRMED"
  | "TABLE_CALL_CANCELLED"
  | "TABLE_CALL_PREPARED"
  | "TABLE_CALL_DELIVERED"
  | "TABLE_CALL_COMPLETED";

export type ApplyMenuOrderActionError =
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "INVALID_ACTION"
  | "FORBIDDEN"
  | "SERVER_ERROR";

export type ApplyMenuOrderItemsError =
  | "NOT_FOUND"
  | "NOT_EDITABLE"
  | "INVALID_PAYLOAD"
  | "SERVER_ERROR";

/** Maps a dashboard order action to the RBAC permission it requires. */
function orderActionToPermission(action: MenuOrderActionType): string {
  switch (action) {
    case "TABLE_CALL_CONFIRMED":
      return "orders:confirm";
    case "TABLE_CALL_CANCELLED":
      return "orders:cancel";
    case "TABLE_CALL_PREPARED":
      return "orders:prepare";
    case "TABLE_CALL_DELIVERED":
      return "orders:deliver";
    case "TABLE_CALL_COMPLETED":
      return "orders:complete";
    default:
      return "orders:view";
  }
}

function orderActionSummaries(
  snap: StaffTableCallRow | null,
  action: MenuOrderActionType,
): { ar: string; en: string } {
  const isDelivery = snap?.type === "delivery";
  const cust =
    snap?.customerName != null && String(snap.customerName).trim() !== ""
      ? String(snap.customerName).trim()
      : "";
  const tbl = String(snap?.tableNumber ?? "").trim();

  if (action === "TABLE_CALL_CONFIRMED") {
    if (isDelivery) {
      return cust
        ? { ar: `قبول طلب توصيل ${cust}`, en: `Accepted delivery order — ${cust}` }
        : { ar: "قبول طلب توصيل", en: "Accepted delivery order" };
    }
    return cust
      ? { ar: `قبول طلب ${cust} — طاولة ${tbl || "?"}`, en: `Accepted order — ${cust} — table ${tbl || "?"}` }
      : { ar: `قبول طلب طاولة ${tbl || "?"}`, en: `Accepted table ${tbl || "?"} order` };
  }
  if (action === "TABLE_CALL_CANCELLED") {
    if (isDelivery) {
      return cust
        ? { ar: `رفض طلب توصيل ${cust}`, en: `Rejected delivery order — ${cust}` }
        : { ar: "رفض طلب توصيل", en: "Rejected delivery order" };
    }
    return cust
      ? { ar: `رفض طلب ${cust} — طاولة ${tbl || "?"}`, en: `Rejected order — ${cust} — table ${tbl || "?"}` }
      : { ar: `رفض طلب طاولة ${tbl || "?"}`, en: `Rejected table ${tbl || "?"} order` };
  }
  if (action === "TABLE_CALL_PREPARED") {
    if (isDelivery) {
      return cust
        ? { ar: `تم تحضير طلب توصيل ${cust}`, en: `Delivery order prepared — ${cust}` }
        : { ar: "تم تحضير طلب التوصيل", en: "Delivery order prepared" };
    }
    return cust
      ? { ar: `تم تحضير طلب ${cust} — طاولة ${tbl || "?"}`, en: `Order prepared — ${cust} — table ${tbl || "?"}` }
      : { ar: `تم تحضير طلب طاولة ${tbl || "?"}`, en: `Table ${tbl || "?"} order prepared` };
  }
  if (action === "TABLE_CALL_COMPLETED") {
    if (isDelivery) {
      return cust
        ? { ar: `إنهاء طلب توصيل ${cust}`, en: `Completed delivery order — ${cust}` }
        : { ar: "إنهاء طلب التوصيل", en: "Completed delivery order" };
    }
    return cust
      ? { ar: `إنهاء طلب ${cust} — طاولة ${tbl || "?"}`, en: `Completed order — ${cust} — table ${tbl || "?"}` }
      : { ar: `إنهاء طلب طاولة ${tbl || "?"}`, en: `Completed table ${tbl || "?"} order` };
  }
  if (isDelivery) {
    return cust
      ? { ar: `تم تسليم طلب توصيل ${cust}`, en: `Delivery order delivered — ${cust}` }
      : { ar: "تم تسليم طلب التوصيل", en: "Delivery order delivered" };
  }
  return cust
    ? { ar: `تم تسليم طلب ${cust} — طاولة ${tbl || "?"}`, en: `Order delivered — ${cust} — table ${tbl || "?"}` }
    : { ar: `تم تسليم طلب طاولة ${tbl || "?"}`, en: `Table ${tbl || "?"} order delivered` };
}

function buildOrderDetailForLog(
  snap: StaffTableCallRow | null,
  existingOrder: Record<string, unknown>,
  status: string,
): Record<string, unknown> {
  return {
    ...existingOrder,
    type: snap?.type ?? existingOrder.type,
    tableNumber: snap?.tableNumber ?? existingOrder.tableNumber ?? null,
    customerName: snap?.customerName ?? existingOrder.customerName ?? null,
    customerPhone: snap?.customerPhone ?? existingOrder.customerPhone ?? null,
    customerAddress:
      snap?.customerAddress ?? existingOrder.customerAddress ?? null,
    orderNotes: snap?.orderNotes ?? existingOrder.orderNotes ?? null,
    items: snap?.items ?? existingOrder.items ?? [],
    orderTotal: snap?.orderTotal ?? existingOrder.orderTotal ?? 0,
    status,
  };
}

async function clearMenuOrderPendingGuestAddition(
  storageMenuId: number,
  callId: number,
  existingOrder: Record<string, unknown>,
): Promise<boolean> {
  const pool = await getPool();
  const updatedOrder = { ...existingOrder, pendingGuestAddition: false };
  const result = await pool
    .request()
    .input("menuId", sql.Int, storageMenuId)
    .input("orderId", sql.Int, callId)
    .input("orderJson", sql.NVarChar(sql.MAX), JSON.stringify(updatedOrder))
    .query(`
      UPDATE dbo.MenuOrders
      SET orderJson = @orderJson, updatedAt = SYSUTCDATETIME()
      WHERE menuId = @menuId AND orderId = @orderId
    `);
  return (result.rowsAffected?.[0] ?? 0) > 0;
}

function actionToStatus(action: MenuOrderActionType): string {
  if (action === "TABLE_CALL_CONFIRMED") return "confirmed";
  if (action === "TABLE_CALL_CANCELLED") return "cancelled";
  if (action === "TABLE_CALL_PREPARED") return "prepared";
  if (action === "TABLE_CALL_COMPLETED") return "delivered";
  return "delivered";
}

/** Resolve delivery vs table from a dashboard `MenuOrders` row id. */
export async function getMenuOrderChannelFromLogId(
  menuId: number,
  menuOrderLogId: number,
): Promise<MenuOrderChannel | null> {
  try {
    const pool = await getPool();
    await ensureStaffTableCallsOrderTypeSchema();
    const logRow = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("logId", sql.Int, menuOrderLogId).query(`
        SELECT mo.orderId, mo.orderJson, stc.orderType, stc.tableNumber
        FROM dbo.MenuOrders mo
        LEFT JOIN dbo.StaffTableCalls stc
          ON stc.menuId = mo.menuId AND stc.id = mo.orderId
        WHERE mo.menuId = @menuId AND mo.id = @logId
      `);

    const row = logRow.recordset[0] as
      | {
          orderId?: number;
          orderJson?: string | null;
          orderType?: string | null;
          tableNumber?: string | null;
        }
      | undefined;
    if (!row?.orderId) return null;

    let order: Record<string, unknown> = {};
    try {
      order = row.orderJson
        ? (JSON.parse(String(row.orderJson)) as Record<string, unknown>)
        : {};
    } catch {
      order = {};
    }

    const fromJson = String(order.type ?? order.orderChannel ?? "")
      .trim()
      .toLowerCase();
    if (fromJson === "delivery" || fromJson === "table") {
      return fromJson;
    }

    const fromStc = String(row.orderType ?? "")
      .trim()
      .toLowerCase();
    if (fromStc === "delivery" || fromStc === "table") {
      return fromStc;
    }

    const tableNumber =
      order.tableNumber != null && String(order.tableNumber).trim() !== ""
        ? String(order.tableNumber).trim()
        : String(row.tableNumber ?? "").trim();
    if (tableNumber.toLowerCase() === "delivery") return "delivery";

    const hasDeliveryFields =
      (order.customerAddress != null &&
        String(order.customerAddress).trim() !== "") ||
      order.governorateId != null;
    if (!tableNumber && hasDeliveryFields) return "delivery";

    return "table";
  } catch (error) {
    logger.error("getMenuOrderChannelFromLogId error:", error);
    return null;
  }
}

/**
 * Dashboard order action: `MenuOrders.id` (activity log row) + lifecycle action.
 */
export async function applyMenuOrderAction(
  menuId: number,
  menuOrderLogId: number,
  action: MenuOrderActionType,
  req: Request,
): Promise<
  | { ok: true; status: string }
  | { ok: false; error: ApplyMenuOrderActionError }
> {
  try {
    const pool = await getPool();
    const deliveryGroupIds = await getDeliveryGroupMenuIds(menuId);
    const menuFilter = menuIdWhereSql(deliveryGroupIds);

    const logRow = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("logId", sql.Int, menuOrderLogId).query(`
        SELECT id, menuId, orderId, orderJson
        FROM dbo.MenuOrders mo
        WHERE ${menuFilter} AND mo.id = @logId
      `);

    const row = logRow.recordset[0] as
      | { menuId?: number; orderId?: number; orderJson?: string | null }
      | undefined;
    if (!row?.orderId) {
      return { ok: false, error: "NOT_FOUND" };
    }

    const storageMenuId = Number(row.menuId ?? menuId);
    const callId = Number(row.orderId);
    if (!Number.isFinite(callId) || callId <= 0) {
      return { ok: false, error: "NOT_FOUND" };
    }

    const snapBefore = await getStaffTableCallSnapshot(storageMenuId, callId);
    if (!snapBefore) {
      return { ok: false, error: "NOT_FOUND" };
    }

    let existingOrder: Record<string, unknown> = {};
    try {
      existingOrder = row.orderJson
        ? (JSON.parse(String(row.orderJson)) as Record<string, unknown>)
        : {};
    } catch {
      existingOrder = {};
    }

    const currentStatus = String(snapBefore.status ?? "pending").toLowerCase();
    const pendingGuestAddition = existingOrder.pendingGuestAddition === true;
    let applied = false;
    let nextStatus = actionToStatus(action);

    const permActor = actorFromRequest(req);
    if (!permActor) {
      return { ok: false, error: "FORBIDDEN" };
    }
    if (!(await authorization.can(permActor, orderActionToPermission(action)))) {
      return { ok: false, error: "FORBIDDEN" };
    }

    /** Reject/prepare/finish stay blocked while guest additions await review. */
    if (
      pendingGuestAddition &&
      (action === "TABLE_CALL_CANCELLED" ||
        action === "TABLE_CALL_PREPARED" ||
        action === "TABLE_CALL_COMPLETED" ||
        (action === "TABLE_CALL_DELIVERED" &&
          snapBefore.type !== "delivery" &&
          String(snapBefore.tableNumber ?? "").trim().toLowerCase() !==
            "delivery"))
    ) {
      return { ok: false, error: "INVALID_STATE" };
    }

    const isTableOrder =
      snapBefore.type !== "delivery" &&
      String(snapBefore.tableNumber ?? "").trim().toLowerCase() !== "delivery";

    if (action === "TABLE_CALL_CONFIRMED") {
      if (pendingGuestAddition) {
        if (currentStatus === "cancelled" || currentStatus === "delivered") {
          return { ok: false, error: "INVALID_STATE" };
        }
        // Pending + new guest lines: accept confirms the whole order in one step.
        if (currentStatus === "pending") {
          applied = await setStaffTableCallStatus(
            callId,
            storageMenuId,
            "confirmed",
          );
          if (applied) {
            await clearMenuOrderPendingGuestAddition(
              storageMenuId,
              callId,
              existingOrder,
            );
          }
          nextStatus = "confirmed";
        } else {
          // Already confirmed/prepared: accept only acknowledges guest additions.
          applied = await clearMenuOrderPendingGuestAddition(
            storageMenuId,
            callId,
            existingOrder,
          );
          nextStatus = currentStatus;
        }
      } else if (currentStatus !== "pending") {
        return { ok: false, error: "INVALID_STATE" };
      } else {
        applied = await setStaffTableCallStatus(callId, storageMenuId, "confirmed");
      }
    } else if (action === "TABLE_CALL_CANCELLED") {
      if (currentStatus !== "pending") {
        return { ok: false, error: "INVALID_STATE" };
      }
      applied = await setStaffTableCallStatus(callId, storageMenuId, "cancelled");
    } else if (action === "TABLE_CALL_PREPARED") {
      if (currentStatus !== "confirmed") {
        return { ok: false, error: "INVALID_STATE" };
      }
      applied = await advanceStaffTableCallStatus(callId, storageMenuId, "prepared");
    } else if (action === "TABLE_CALL_COMPLETED") {
      if (!isTableOrder) {
        return { ok: false, error: "INVALID_ACTION" };
      }
      if (currentStatus !== "confirmed" && currentStatus !== "prepared") {
        return { ok: false, error: "INVALID_STATE" };
      }
      applied = await completeStaffTableCall(callId, storageMenuId);
    } else if (action === "TABLE_CALL_DELIVERED") {
      if (isTableOrder) {
        if (currentStatus !== "confirmed" && currentStatus !== "prepared") {
          return { ok: false, error: "INVALID_STATE" };
        }
        applied = await completeStaffTableCall(callId, storageMenuId);
      } else {
        if (currentStatus !== "prepared") {
          return { ok: false, error: "INVALID_STATE" };
        }
        applied = await advanceStaffTableCallStatus(callId, storageMenuId, "delivered");
      }
    } else {
      return { ok: false, error: "INVALID_ACTION" };
    }

    if (!applied) {
      return { ok: false, error: "INVALID_STATE" };
    }

    const snapAfter = await getStaffTableCallSnapshot(storageMenuId, callId);
    const sums =
      action === "TABLE_CALL_CONFIRMED" && pendingGuestAddition
        ? {
            ar: `قبول إضافة — طاولة ${String(snapAfter?.tableNumber ?? "?")}`,
            en: `Addition accepted — table ${String(snapAfter?.tableNumber ?? "?")}`,
          }
        : orderActionSummaries(snapAfter, action);
    const orderDetail = await attachMenuChargeFieldsToOrder(
      storageMenuId,
      snapAfter?.items ?? [],
      buildOrderDetailForLog(
        snapAfter,
        {
          ...existingOrder,
          ...(action === "TABLE_CALL_CONFIRMED" && pendingGuestAddition
            ? { pendingGuestAddition: false }
            : {}),
          ...(action === "TABLE_CALL_CANCELLED" ||
          action === "TABLE_CALL_COMPLETED" ||
          action === "TABLE_CALL_DELIVERED"
            ? { pendingBillRequest: false }
            : {}),
        },
        nextStatus,
      ),
    );

    await logMenuActivitySafe(req, storageMenuId, {
      action,
      targetType: "table_call",
      targetId: callId,
      summaryAr: sums.ar,
      summaryEn: sums.en,
      detailJson: JSON.stringify({
        status: nextStatus,
        order: orderDetail,
      }),
    });

    const isDelivery =
      String(existingOrder.type ?? "").toLowerCase() === "delivery" ||
      String(snapAfter?.tableNumber ?? "").toLowerCase() === "delivery";
    if (isDelivery) {
      const extra = deliveryGroupIds.filter((id) => id !== storageMenuId);
      if (extra.length > 0) {
        broadcastMenuActivityUpdated(storageMenuId, extra);
      }
    }

    return { ok: true, status: nextStatus };
  } catch (error) {
    logger.error("applyMenuOrderAction error:", error);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

/**
 * Dashboard / owner / cashier: replace order lines on an open call.
 */
export async function applyMenuOrderItemsUpdate(
  menuId: number,
  menuOrderLogId: number,
  itemsRaw: unknown,
  req: Request,
): Promise<
  | {
      ok: true;
      items: StaffTableCallRow["items"];
      orderTotal: number;
      status: string;
    }
  | { ok: false; error: ApplyMenuOrderItemsError }
> {
  try {
    const pool = await getPool();
    const deliveryGroupIds = await getDeliveryGroupMenuIds(menuId);
    const menuFilter = menuIdWhereSql(deliveryGroupIds);

    const logRow = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("logId", sql.Int, menuOrderLogId).query(`
        SELECT id, menuId, orderId, orderJson
        FROM dbo.MenuOrders mo
        WHERE ${menuFilter} AND mo.id = @logId
      `);

    const row = logRow.recordset[0] as
      | { menuId?: number; orderId?: number; orderJson?: string | null }
      | undefined;
    if (!row?.orderId) {
      return { ok: false, error: "NOT_FOUND" };
    }

    const storageMenuId = Number(row.menuId ?? menuId);
    const callId = Number(row.orderId);
    if (!Number.isFinite(callId) || callId <= 0) {
      return { ok: false, error: "NOT_FOUND" };
    }

    const actor = await resolveActorForLog(req);
    const editorStaffId =
      actor.actorRole === ROLES.STAFF ? (req.user as TokenPayload).userId : 0;

    const result = await updateStaffTableCallItems(
      callId,
      storageMenuId,
      itemsRaw,
      editorStaffId > 0 ? editorStaffId : 1,
    );

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return { ok: false, error: "NOT_FOUND" };
      }
      if (result.error === "NOT_EDITABLE" || result.error === "NOT_PENDING") {
        return { ok: false, error: "NOT_EDITABLE" };
      }
      if (
        result.error === "INVALID_PAYLOAD" ||
        result.error === "INVALID_ORDER_ITEMS"
      ) {
        return { ok: false, error: "INVALID_PAYLOAD" };
      }
      return { ok: false, error: "SERVER_ERROR" };
    }

    let existingOrder: Record<string, unknown> = {};
    try {
      existingOrder = row.orderJson
        ? (JSON.parse(String(row.orderJson)) as Record<string, unknown>)
        : {};
    } catch {
      existingOrder = {};
    }

    const snapAfter = await getStaffTableCallSnapshot(storageMenuId, callId);
    const orderDetail = await attachMenuChargeFieldsToOrder(
      storageMenuId,
      snapAfter?.items ?? result.items,
      buildOrderDetailForLog(snapAfter, existingOrder, result.status),
    );

    await logMenuActivitySafe(req, storageMenuId, {
      action: "TABLE_CALL_ITEMS_UPDATED",
      targetType: "table_call",
      targetId: callId,
      summaryAr: `تعديل أصناف طلب — طاولة ${String(result.tableNumber ?? "?")}`,
      summaryEn: `Edited order lines — table ${String(result.tableNumber ?? "?")}`,
      detailJson: JSON.stringify({
        status: result.status,
        order: orderDetail,
      }),
    });

    return {
      ok: true,
      items: result.items,
      orderTotal: Number(orderDetail.orderTotal ?? result.orderTotal),
      status: result.status,
    };
  } catch (error) {
    logger.error("applyMenuOrderItemsUpdate error:", error);
    return { ok: false, error: "SERVER_ERROR" };
  }
}
