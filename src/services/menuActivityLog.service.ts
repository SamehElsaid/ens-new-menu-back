import type { Request } from "express";
import { getPool, sql } from "../config/database";
import { ROLES } from "../config/constants";
import {
  getMenuStaffColumnMeta,
  quoteMenuStaffIdent,
} from "../config/menuStaffColumns";
import { normalizeStaffJobRole } from "../config/staffJobRoles";
import { ensureMenuAuditLogSchema } from "../schemas/menuAuditLog.schema";
import { ensureStaffTableCallsOrderTypeSchema } from "../schemas/staffTableCallsOrderType.schema";
import type { TokenPayload } from "../utils/tokenHelper";
import { logger } from "../utils/logger";
import { broadcastMenuActivityUpdated } from "../socket/staffIoBroadcast";
import {
  advanceStaffTableCallStatus,
  getStaffTableCallSnapshot,
  setStaffTableCallStatus,
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
  if (action === "TABLE_CALL_CREATED") return "pending";
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
      const roleSql = meta.roleColumnQuoted
        ? `, ${meta.roleColumnQuoted} AS jobRole`
        : "";
      const r = await pool
        .request()
        .input("id", sql.Int, u.userId)
        .query(
          `SELECT ${nameCol} AS displayName${roleSql} FROM MenuStaff WHERE id = @id`,
        );
      const row = r.recordset[0] as Record<string, unknown> | undefined;
      const name = row?.displayName ?? row?.DisplayName;
      const label =
        name != null && String(name).trim() !== ""
          ? String(name).trim()
          : (u.email ?? "Staff");
      const jobRaw =
        row?.jobRole ??
        row?.JobRole ??
        (row && meta.roleKey ? row[meta.roleKey] : undefined);
      const staffJobRole =
        jobRaw != null ? normalizeStaffJobRole(jobRaw) : null;
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

/**
 * Activity history is for table orders only: `MenuOrders.orderId` must match
 * `StaffTableCalls.id`. Other features incorrectly reused `targetId` as `orderId`
 * (e.g. staff id), which polluted this feed — exclude those rows.
 */
export type MenuOrderChannel = "delivery" | "table";

async function menuOrdersTableCallExistsSql(
  channel?: MenuOrderChannel | null,
): Promise<string> {
  await ensureStaffTableCallsOrderTypeSchema();
  const pool = await getPool();
  const oid = await pool.request().query(`
    SELECT OBJECT_ID(N'dbo.StaffTableCalls', N'U') AS oid
  `);
  if (!oid.recordset?.[0]?.oid) return "";

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
      )`;
  }

  return `
    AND EXISTS (
      SELECT 1
      FROM dbo.StaffTableCalls stc
      WHERE stc.menuId = mo.menuId AND stc.id = mo.orderId
      ${channelFilter}
    )`;
}

export async function getMenuActivityLogById(
  menuId: number,
  id: number,
): Promise<{
  id: string;
  orderId: string;
  lastAction: string;
  actions: any[];
  order: any;
  items: any[];
  totalPrice: number;
  updatedAt: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  orderNotes?: string | null;
  governorateId?: number | null;
  governorateNameAr?: string | null;
  governorateNameEn?: string | null;
  deliveryFee?: number | null;
} | null> {
  try {
    const pool = await getPool();
    const tableCheck = await pool.request().query(`
      SELECT OBJECT_ID(N'dbo.MenuOrders', N'U') AS oid
    `);
    if (!tableCheck.recordset[0]?.oid) return null;

    const tableCallOnly = await menuOrdersTableCallExistsSql();

    const result = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("id", sql.Int, id).query(`
        SELECT
          mo.id,
          mo.orderId,
          mo.orderJson,
          mo.actionsJson,
          mo.updatedAt,
          stc.customerPhone,
          stc.customerAddress,
          stc.orderNotes,
          stc.orderType
        FROM dbo.MenuOrders mo
        LEFT JOIN dbo.StaffTableCalls stc
          ON stc.menuId = mo.menuId AND stc.id = mo.orderId
        WHERE mo.menuId = @menuId AND mo.id = @id
        ${tableCallOnly}
      `);

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

    return {
      id: String(r.id),
      orderId: String(r.orderId),
      lastAction: String(lastAction),
      actions,
      order,
      items: order.items || [],
      totalPrice: Number(order.orderTotal || 0),
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

    const tableCallOnly = await menuOrdersTableCallExistsSql(channel ?? null);

    const countReq = pool.request().input("menuId", sql.Int, menuId);
    const rowsReq = pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, safeLimit);

    let nameCondition = "";
    if (nameFilter != null) {
      rowsReq.input("nameFilter", sql.NVarChar, nameFilter);
      countReq.input("nameFilter", sql.NVarChar, nameFilter);
      nameCondition = `
        AND (
          mo.actionsJson LIKE N'%' + @nameFilter + N'%'
          OR mo.orderJson LIKE N'%' + @nameFilter + N'%'
        )`;
    }

    const countR = await countReq.query(`
      SELECT COUNT(*) AS c
      FROM dbo.MenuOrders mo
      WHERE mo.menuId = @menuId
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
      WHERE mo.menuId = @menuId
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
  | "TABLE_CALL_DELIVERED";

export type ApplyMenuOrderActionError =
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "INVALID_ACTION"
  | "SERVER_ERROR";

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

function actionToStatus(action: MenuOrderActionType): string {
  if (action === "TABLE_CALL_CONFIRMED") return "confirmed";
  if (action === "TABLE_CALL_CANCELLED") return "cancelled";
  if (action === "TABLE_CALL_PREPARED") return "prepared";
  return "delivered";
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
    const logRow = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("logId", sql.Int, menuOrderLogId).query(`
        SELECT id, orderId, orderJson
        FROM dbo.MenuOrders
        WHERE menuId = @menuId AND id = @logId
      `);

    const row = logRow.recordset[0] as
      | { orderId?: number; orderJson?: string | null }
      | undefined;
    if (!row?.orderId) {
      return { ok: false, error: "NOT_FOUND" };
    }

    const callId = Number(row.orderId);
    if (!Number.isFinite(callId) || callId <= 0) {
      return { ok: false, error: "NOT_FOUND" };
    }

    const snapBefore = await getStaffTableCallSnapshot(menuId, callId);
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
    let applied = false;

    if (action === "TABLE_CALL_CONFIRMED") {
      if (currentStatus !== "pending") {
        return { ok: false, error: "INVALID_STATE" };
      }
      applied = await setStaffTableCallStatus(callId, menuId, "confirmed");
    } else if (action === "TABLE_CALL_CANCELLED") {
      if (currentStatus !== "pending") {
        return { ok: false, error: "INVALID_STATE" };
      }
      applied = await setStaffTableCallStatus(callId, menuId, "cancelled");
    } else if (action === "TABLE_CALL_PREPARED") {
      if (currentStatus !== "confirmed") {
        return { ok: false, error: "INVALID_STATE" };
      }
      applied = await advanceStaffTableCallStatus(callId, menuId, "prepared");
    } else if (action === "TABLE_CALL_DELIVERED") {
      if (currentStatus !== "prepared") {
        return { ok: false, error: "INVALID_STATE" };
      }
      applied = await advanceStaffTableCallStatus(callId, menuId, "delivered");
    } else {
      return { ok: false, error: "INVALID_ACTION" };
    }

    if (!applied) {
      return { ok: false, error: "INVALID_STATE" };
    }

    const snapAfter = await getStaffTableCallSnapshot(menuId, callId);
    const nextStatus = actionToStatus(action);
    const sums = orderActionSummaries(snapAfter, action);
    const orderDetail = buildOrderDetailForLog(
      snapAfter,
      existingOrder,
      nextStatus,
    );

    await logMenuActivitySafe(req, menuId, {
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

    return { ok: true, status: nextStatus };
  } catch (error) {
    logger.error("applyMenuOrderAction error:", error);
    return { ok: false, error: "SERVER_ERROR" };
  }
}
