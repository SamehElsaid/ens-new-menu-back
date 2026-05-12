import type { Request } from "express";
import { getPool, sql } from "../config/database";
import { ROLES } from "../config/constants";
import {
  getMenuStaffColumnMeta,
  quoteMenuStaffIdent,
} from "../config/menuStaffColumns";
import { normalizeStaffJobRole } from "../config/staffJobRoles";
import type { TokenPayload } from "../utils/tokenHelper";
import { logger } from "../utils/logger";
import { broadcastMenuActivityUpdated } from "../socket/staffIoBroadcast";

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
  if (action === "TABLE_CALL_ITEMS_UPDATED" || action === "TABLE_CALL_UPDATED") {
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
    detailObj.order && typeof detailObj.order === "object" ? detailObj.order : {};
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
    .input("orderId", sql.Int, orderId)
    .query(`
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
      )
      .query(`
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

export async function resolveActorForLog(
  req: Request,
): Promise<{
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
          : u.email ?? "Staff";
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
export async function logMenuActivitySafe(
  req: Request,
  menuId: number,
  row: MenuActivityInsert,
): Promise<void> {
  try {
    if (!Number.isFinite(menuId) || menuId <= 0) return;
    if (!Number.isFinite(row.targetId ?? NaN) || (row.targetId ?? 0) <= 0) return;

    const actor = await resolveActorForLog(req);
    const orderId = Number(row.targetId);
    await appendMenuOrderActivity(menuId, orderId, actor, row);
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

function sanitizeActorNameSearch(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const t = String(raw).trim().slice(0, 100);
  if (t.length === 0) return null;
  return t.replace(/[%_\[\]]/g, "");
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
} | null> {
  try {
    const pool = await getPool();
    const tableCheck = await pool.request().query(`
      SELECT OBJECT_ID(N'dbo.MenuOrders', N'U') AS oid
    `);
    if (!tableCheck.recordset[0]?.oid) return null;

    const result = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("id", sql.Int, id)
      .query(`
        SELECT
          mo.id,
          mo.orderId,
          mo.orderJson,
          mo.actionsJson,
          mo.updatedAt
        FROM dbo.MenuOrders mo
        WHERE mo.menuId = @menuId AND mo.id = @id
      `);

    if (!result.recordset.length) return null;

    const r = result.recordset[0] as Record<string, unknown>;

    let order: any = {};
    try {
      order = r.orderJson ? JSON.parse(String(r.orderJson)) : {};
    } catch { /* ignore */ }

    let actions: any[] = [];
    try {
      actions = r.actionsJson ? JSON.parse(String(r.actionsJson)) : [];
      if (!Array.isArray(actions)) actions = [];
    } catch { /* ignore */ }

    const lastAction = actions.length > 0 ? actions[actions.length - 1].action : "";

    return {
      id: String(r.id),
      orderId: String(r.orderId),
      lastAction: String(lastAction),
      actions,
      order,
      items: order.items || [],
      totalPrice: Number(order.orderTotal || 0),
      updatedAt: r.updatedAt ? String(r.updatedAt) : null,
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
      nameCondition = "AND mo.actionsJson LIKE N'%' + @nameFilter + N'%'";
    }

    const countR = await countReq.query(`
      SELECT COUNT(*) AS c
      FROM dbo.MenuOrders mo
      WHERE mo.menuId = @menuId
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
      
      const lastAction = actions.length > 0 ? actions[actions.length - 1].action : "";
      
      const actionDetails = actions.map(a => ({
        waiterName: a.waiterName || "",
        time: a.time || "",
        status: a.status || ""
      }));

      return {
        id: String(r.id),
        orderId: String(r.orderId),
        lastAction: String(lastAction),
        actionDetails: actionDetails,
        items: order.items || [],
        totalPrice: Number(order.orderTotal || 0)
      };
    });

    return { rows, total, page: safePage, limit: safeLimit };
  } catch (error) {
    logger.error("listMenuActivityLogs error:", error);
    return { rows: [], total: 0, page: safePage, limit: safeLimit };
  }
}
