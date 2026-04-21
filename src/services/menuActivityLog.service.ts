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

/** Always re-check so new migrations apply without server restart. */
async function menuActivityLogHasActorStaffJobColumn(
  pool: Awaited<ReturnType<typeof getPool>>,
): Promise<boolean> {
  const r = await pool.request().query(`
    SELECT COL_LENGTH(N'dbo.MenuActivityLog', N'actorStaffJobRole') AS len
  `);
  return Number(r.recordset[0]?.len ?? 0) > 0;
}

function mergeActorStaffJobIntoDetailJson(
  detailJson: string | null | undefined,
  actor: { actorRole: string; staffJobRole: string | null },
): string | null {
  if (actor.actorRole !== ROLES.STAFF || !actor.staffJobRole) {
    return detailJson ?? null;
  }
  try {
    const obj: Record<string, unknown> = detailJson
      ? (JSON.parse(detailJson) as Record<string, unknown>)
      : {};
    obj.actorStaffJobRole = actor.staffJobRole;
    return JSON.stringify(obj);
  } catch {
    return JSON.stringify({ actorStaffJobRole: actor.staffJobRole });
  }
}

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
    const actor = await resolveActorForLog(req);
    const pool = await getPool();
    const hasStaffJobCol = await menuActivityLogHasActorStaffJobColumn(pool);
    const mergedDetail = mergeActorStaffJobIntoDetailJson(row.detailJson, actor);
    const reqBase = pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("actorRole", sql.NVarChar, actor.actorRole)
      .input("actorName", sql.NVarChar, actor.actorName)
      .input("action", sql.NVarChar, row.action)
      .input("targetType", sql.NVarChar, row.targetType ?? null)
      .input("targetId", sql.Int, row.targetId ?? null)
      .input("summaryAr", sql.NVarChar, row.summaryAr)
      .input("summaryEn", sql.NVarChar, row.summaryEn)
      .input("detailJson", sql.NVarChar(sql.MAX), mergedDetail);

    if (hasStaffJobCol) {
      await reqBase
        .input(
          "actorStaffJobRole",
          sql.NVarChar,
          actor.staffJobRole ?? null,
        )
        .query(`
        INSERT INTO dbo.MenuActivityLog
          (menuId, actorRole, actorName, actorStaffJobRole, action, targetType, targetId, summaryAr, summaryEn, detailJson)
        VALUES
          (@menuId, @actorRole, @actorName, @actorStaffJobRole, @action, @targetType, @targetId, @summaryAr, @summaryEn, @detailJson)
      `);
    } else {
      await reqBase.query(`
        INSERT INTO dbo.MenuActivityLog
          (menuId, actorRole, actorName, action, targetType, targetId, summaryAr, summaryEn, detailJson)
        VALUES
          (@menuId, @actorRole, @actorName, @action, @targetType, @targetId, @summaryAr, @summaryEn, @detailJson)
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
      SELECT OBJECT_ID(N'dbo.MenuActivityLog', N'U') AS oid
    `);
    if (!tableCheck.recordset[0]?.oid) {
      return { rows: [], total: 0, page: safePage, limit: safeLimit };
    }

    const countReq = pool.request().input("menuId", sql.Int, menuId);
    if (nameFilter != null) {
      countReq.input("nameFilter", sql.NVarChar, nameFilter);
    }
    const countR = await countReq.query(`
      SELECT COUNT(*) AS c FROM dbo.MenuActivityLog
      WHERE menuId = @menuId
      ${nameFilter != null ? "AND actorName LIKE N'%' + @nameFilter + N'%'" : ""}
    `);
    const total = Number(countR.recordset[0]?.c ?? 0);

    const hasStaffJobCol = await menuActivityLogHasActorStaffJobColumn(pool);

    const selectCols = hasStaffJobCol
      ? `id, menuId, actorRole, actorName, actorStaffJobRole, action, targetType, targetId,
               summaryAr, summaryEn, detailJson, createdAt`
      : `id, menuId, actorRole, actorName, action, targetType, targetId,
               summaryAr, summaryEn, detailJson, createdAt`;

    const rowsReq = pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, safeLimit);
    if (nameFilter != null) {
      rowsReq.input("nameFilter", sql.NVarChar, nameFilter);
    }
    const rowsR = await rowsReq.query(`
        SELECT ${selectCols}
        FROM dbo.MenuActivityLog
        WHERE menuId = @menuId
        ${nameFilter != null ? "AND actorName LIKE N'%' + @nameFilter + N'%'" : ""}
        ORDER BY createdAt DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    const rows = (rowsR.recordset as Record<string, unknown>[]).map((r) => ({
      id: r.id as number,
      menuId: r.menuId as number,
      actorRole: String(r.actorRole ?? ""),
      actorName: String(r.actorName ?? ""),
      actorStaffJobRole: (() => {
        const fromCol =
          hasStaffJobCol ? pickActorStaffJobFromRow(r) : null;
        const fromDetail = actorStaffJobFromDetailJson(r.detailJson);
        return fromCol ?? fromDetail ?? null;
      })(),
      action: String(r.action ?? ""),
      targetType:
        r.targetType != null ? String(r.targetType) : (null as string | null),
      targetId: r.targetId != null ? Number(r.targetId) : null,
      summaryAr:
        r.summaryAr != null ? String(r.summaryAr) : (null as string | null),
      summaryEn:
        r.summaryEn != null ? String(r.summaryEn) : (null as string | null),
      detailJson:
        r.detailJson != null ? String(r.detailJson) : (null as string | null),
      createdAt: (r.createdAt as Date).toISOString(),
    }));

    return { rows, total, page: safePage, limit: safeLimit };
  } catch (error) {
    logger.error("listMenuActivityLogs error:", error);
    return { rows: [], total: 0, page: safePage, limit: safeLimit };
  }
}
