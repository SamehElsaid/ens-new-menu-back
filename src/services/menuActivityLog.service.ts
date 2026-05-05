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

export type MenuActivityInsert = {
  action: string;
  targetType?: string | null;
  targetId?: number | null;
  summaryAr: string;
  summaryEn: string;
  detailJson?: string | null;
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
    const pool = await getPool();
    const orderId = Number(row.targetId);
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
    } else {
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
    }
  } catch (e) {
    logger.warn("logMenuActivitySafe skipped", e);
  }
}

function sanitizeActorNameSearch(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const t = String(raw).trim().slice(0, 100);
  if (t.length === 0) return null;
  return t.replace(/[%_\[\]]/g, "");
}

export async function listMenuActivityLogs(
  menuId: number,
  page: number,
  limit: number,
  actorNameSearch?: string | null,
): Promise<{
  rows: {
    id: number;
    menuId: number;
    actorRole: string;
    actorName: string;
    actorStaffJobRole: string | null;
    action: string;
    targetType: string | null;
    targetId: number | null;
    summaryAr: string | null;
    summaryEn: string | null;
    detailJson: string | null;
    createdAt: string;
  }[];
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
    if (nameFilter != null) {
      rowsReq.input("nameFilter", sql.NVarChar, nameFilter);
      countReq.input("nameFilter", sql.NVarChar, nameFilter);
    }
    const countR = await countReq.query(`
      SELECT COUNT(*) AS c
      FROM dbo.MenuOrders mo
      CROSS APPLY OPENJSON(mo.actionsJson)
      WITH (
        waiterName NVARCHAR(255) '$.waiterName'
      ) a
      WHERE mo.menuId = @menuId
      ${nameFilter != null ? "AND a.waiterName LIKE N'%' + @nameFilter + N'%'" : ""}
    `);
    const total = Number(countR.recordset[0]?.c ?? 0);

    const rowsR = await rowsReq.query(`
      SELECT
        mo.id AS sourceId,
        mo.menuId,
        mo.orderId,
        a.action,
        a.status,
        a.waiterName,
        a.waiterRole,
        a.actorRole,
        a.actorStaffJobRole,
        a.summaryAr,
        a.summaryEn,
        a.[time],
        a.detail
      FROM dbo.MenuOrders mo
      CROSS APPLY OPENJSON(mo.actionsJson)
      WITH (
        action NVARCHAR(64) '$.action',
        status NVARCHAR(32) '$.status',
        waiterName NVARCHAR(255) '$.waiterName',
        waiterRole NVARCHAR(64) '$.waiterRole',
        actorRole NVARCHAR(32) '$.actorRole',
        actorStaffJobRole NVARCHAR(64) '$.actorStaffJobRole',
        summaryAr NVARCHAR(1000) '$.summaryAr',
        summaryEn NVARCHAR(1000) '$.summaryEn',
        [time] DATETIME2 '$.time',
        detail NVARCHAR(MAX) '$.detail' AS JSON
      ) a
      WHERE mo.menuId = @menuId
      ${nameFilter != null ? "AND a.waiterName LIKE N'%' + @nameFilter + N'%'" : ""}
      ORDER BY a.[time] DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const rows = (rowsR.recordset as Record<string, unknown>[]).map((r, idx) => {
      const actorRole = String(r.actorRole ?? r.waiterRole ?? ROLES.STAFF);
      const detailObj = r.detail != null ? String(r.detail) : null;
      const detailWithRole = (() => {
        if (!detailObj) return null;
        try {
          const parsed = JSON.parse(detailObj) as Record<string, unknown>;
          if (!parsed.actorStaffJobRole && r.actorStaffJobRole) {
            parsed.actorStaffJobRole = String(r.actorStaffJobRole);
          }
          return JSON.stringify(parsed);
        } catch {
          return detailObj;
        }
      })();
      const createdAtRaw = r.time as Date | string | null | undefined;
      const createdAt = createdAtRaw
        ? new Date(createdAtRaw).toISOString()
        : new Date().toISOString();
      return {
        id: Number(r.sourceId ?? 0) * 100000 + idx + 1,
        menuId: Number(r.menuId ?? menuId),
        actorRole,
        actorName: String(r.waiterName ?? ""),
        actorStaffJobRole:
          r.actorStaffJobRole != null ? String(r.actorStaffJobRole) : null,
        action: String(r.action ?? ""),
        targetType: "order",
        targetId: Number(r.orderId ?? 0),
        summaryAr: r.summaryAr != null ? String(r.summaryAr) : null,
        summaryEn: r.summaryEn != null ? String(r.summaryEn) : null,
        detailJson: detailWithRole ?? detailObj,
        createdAt,
      };
    });

    return { rows, total, page: safePage, limit: safeLimit };
  } catch (error) {
    logger.error("listMenuActivityLogs error:", error);
    return { rows: [], total: 0, page: safePage, limit: safeLimit };
  }
}
