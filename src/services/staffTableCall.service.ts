/**
 * Persisted guest → staff table calls (StaffTableCalls).
 */

import { getPool, sql } from "../config/database";
import { getMenuTablesColumnMeta } from "../config/menuTablesColumns";
import {
  getMenuStaffColumnMeta,
  getStaffIsActive,
} from "../config/menuStaffColumns";
import { logger } from "../utils/logger";
import { isUserOnFreePlan } from "./subscriptionPlan.service";

export type GuestStaffCallError =
  | "INVALID_PAYLOAD"
  | "MENU_NOT_FOUND"
  | "INVALID_TABLE"
  | "FEATURE_REQUIRES_PRO"
  | "SERVER_ERROR";

/**
 * Shared guest "call staff" logic (Socket.IO + HTTP).
 */
export async function processGuestStaffCall(
  menuId: number,
  tableNumber: string,
): Promise<
  | {
      ok: true;
      id: number;
      menuId: number;
      tableNumber: string;
      createdAt: Date;
    }
  | { ok: false; error: GuestStaffCallError }
> {
  if (!Number.isFinite(menuId) || menuId <= 0) {
    return { ok: false, error: "INVALID_PAYLOAD" };
  }
  const safeTable = String(tableNumber ?? "")
    .trim()
    .slice(0, 50);
  if (!safeTable) {
    return { ok: false, error: "INVALID_PAYLOAD" };
  }

  try {
    const pool = await getPool();
    const menuCheck = await pool
      .request()
      .input("id", sql.Int, menuId)
      .query(`SELECT id, isActive, userId FROM Menus WHERE id = @id`);

    const m = menuCheck.recordset[0];
    if (!m || !m.isActive) {
      return { ok: false, error: "MENU_NOT_FOUND" };
    }

    const ownerId = m.userId as number;
    if (await isUserOnFreePlan(ownerId)) {
      return { ok: false, error: "FEATURE_REQUIRES_PRO" };
    }

    const tablesCount = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .query(`SELECT COUNT(*) as c FROM MenuTables WHERE menuId = @menuId`);
    const hasTables = Number(tablesCount.recordset[0]?.c) > 0;
    if (hasTables) {
      const tableMeta = await getMenuTablesColumnMeta();
      const activeSql = tableMeta.activeColumnQuoted
        ? ` AND ${tableMeta.activeColumnQuoted} = 1`
        : "";
      const match = await pool
        .request()
        .input("menuId", sql.Int, menuId)
        .input("tableNumber", sql.NVarChar, safeTable)
        .query(
          `SELECT id FROM MenuTables WHERE menuId = @menuId AND tableNumber = @tableNumber${activeSql}`,
        );
      if (match.recordset.length === 0) {
        return { ok: false, error: "INVALID_TABLE" };
      }
    }

    const persisted = await createStaffTableCall(menuId, safeTable);
    if (!persisted) {
      return { ok: false, error: "SERVER_ERROR" };
    }

    return {
      ok: true,
      id: persisted.id,
      menuId,
      tableNumber: safeTable,
      createdAt: persisted.createdAt,
    };
  } catch (error) {
    logger.error("processGuestStaffCall error:", error);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

export type StaffTableCallRow = {
  id: number;
  menuId: number;
  tableNumber: string;
  createdAt: Date;
};

export type StaffTableCallHistoryRow = StaffTableCallRow & {
  acknowledgedAt: Date | null;
};

export type StaffTableCallHistoryPage = {
  rows: StaffTableCallHistoryRow[];
  total: number;
  page: number;
  limit: number;
};

export async function getMenuIdForStaff(
  staffId: number,
): Promise<number | null> {
  try {
    const meta = await getMenuStaffColumnMeta();
    const pool = await getPool();
    const r = await pool
      .request()
      .input("id", sql.Int, staffId)
      .query(`SELECT * FROM MenuStaff WHERE id = @id`);

    const row = r.recordset[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    if (!getStaffIsActive(row, meta)) {
      return null;
    }

    const raw = row.menuId;
    const menuId =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? parseInt(raw, 10)
          : NaN;
    return Number.isFinite(menuId) && menuId > 0 ? menuId : null;
  } catch (error) {
    logger.error("getMenuIdForStaff error:", error);
    return null;
  }
}

export async function createStaffTableCall(
  menuId: number,
  tableNumber: string,
): Promise<{ id: number; createdAt: Date } | null> {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("tableNumber", sql.NVarChar, tableNumber).query(`
        INSERT INTO StaffTableCalls (menuId, tableNumber)
        OUTPUT INSERTED.id, INSERTED.createdAt
        VALUES (@menuId, @tableNumber)
      `);
    const row = result.recordset[0];
    if (!row?.id) {
      return null;
    }
    return {
      id: row.id as number,
      createdAt: row.createdAt as Date,
    };
  } catch (error) {
    logger.error("createStaffTableCall error:", error);
    return null;
  }
}

export async function getPendingStaffTableCalls(
  menuId: number,
  limit = 100,
): Promise<StaffTableCallRow[]> {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("limit", sql.Int, Math.min(Math.max(limit, 1), 500)).query(`
        SELECT TOP (@limit)
          id,
          menuId,
          tableNumber,
          createdAt
        FROM StaffTableCalls
        WHERE menuId = @menuId AND acknowledgedAt IS NULL
        ORDER BY createdAt ASC
      `);
    return (result.recordset as StaffTableCallRow[]).map((row) => ({
      id: row.id,
      menuId: row.menuId,
      tableNumber: String(row.tableNumber),
      createdAt: row.createdAt,
    }));
  } catch (error) {
    logger.error("getPendingStaffTableCalls error:", error);
    return [];
  }
}

/**
 * All table-call rows for a menu (newest first), pending and acknowledged.
 */
export async function getStaffTableCallsHistory(
  menuId: number,
  page = 1,
  limit = 20,
): Promise<StaffTableCallHistoryPage> {
  try {
    const pool = await getPool();
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500);
    const offset = (safePage - 1) * safeLimit;

    const totalResult = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .query(`
        SELECT COUNT(*) as total
        FROM StaffTableCalls
        WHERE menuId = @menuId
      `);
    const total = Number(totalResult.recordset[0]?.total ?? 0);

    const rowsResult = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, safeLimit)
      .query(`
        SELECT
          id,
          menuId,
          tableNumber,
          createdAt,
          acknowledgedAt
        FROM StaffTableCalls
        WHERE menuId = @menuId
        ORDER BY createdAt DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    const rows = (rowsResult.recordset as StaffTableCallHistoryRow[]).map((row) => ({
      id: row.id,
      menuId: row.menuId,
      tableNumber: String(row.tableNumber),
      createdAt: row.createdAt,
      acknowledgedAt: row.acknowledgedAt ?? null,
    }));

    return {
      rows,
      total,
      page: safePage,
      limit: safeLimit,
    };
  } catch (error) {
    logger.error("getStaffTableCallsHistory error:", error);
    return {
      rows: [],
      total: 0,
      page: Math.max(1, Math.floor(page)),
      limit: Math.min(Math.max(Math.floor(limit), 1), 500),
    };
  }
}

export async function acknowledgeStaffTableCall(
  callId: number,
  menuId: number,
): Promise<boolean> {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("id", sql.Int, callId)
      .input("menuId", sql.Int, menuId).query(`
        UPDATE StaffTableCalls
        SET acknowledgedAt = SYSUTCDATETIME()
        WHERE id = @id AND menuId = @menuId AND acknowledgedAt IS NULL
      `);
    return (result.rowsAffected?.[0] ?? 0) > 0;
  } catch (error) {
    logger.error("acknowledgeStaffTableCall error:", error);
    return false;
  }
}
