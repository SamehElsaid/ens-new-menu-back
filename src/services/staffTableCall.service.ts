/**
 * Persisted guest → staff table calls (StaffTableCalls).
 */

import { getPool, sql } from "../config/database";
import { getMenuTablesColumnMeta } from "../config/menuTablesColumns";
import { logger } from "../utils/logger";

export type GuestStaffCallError =
  | "INVALID_PAYLOAD"
  | "MENU_NOT_FOUND"
  | "INVALID_TABLE"
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
      .query(`SELECT id, isActive FROM Menus WHERE id = @id`);

    const m = menuCheck.recordset[0];
    if (!m || !m.isActive) {
      return { ok: false, error: "MENU_NOT_FOUND" };
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

export async function getMenuIdForStaff(
  staffId: number,
): Promise<number | null> {
  try {
    const pool = await getPool();
    const r = await pool
      .request()
      .input("id", sql.Int, staffId)
      .query(`SELECT menuId FROM MenuStaff WHERE id = @id AND isActive = 1`);
    const menuId = r.recordset[0]?.menuId;
    return typeof menuId === "number" ? menuId : null;
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
  limit = 200,
): Promise<StaffTableCallHistoryRow[]> {
  try {
    const pool = await getPool();
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const result = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("limit", sql.Int, safeLimit).query(`
        SELECT TOP (@limit)
          id,
          menuId,
          tableNumber,
          createdAt,
          acknowledgedAt
        FROM StaffTableCalls
        WHERE menuId = @menuId
        ORDER BY createdAt DESC
      `);
    return (result.recordset as StaffTableCallHistoryRow[]).map((row) => ({
      id: row.id,
      menuId: row.menuId,
      tableNumber: String(row.tableNumber),
      createdAt: row.createdAt,
      acknowledgedAt: row.acknowledgedAt ?? null,
    }));
  } catch (error) {
    logger.error("getStaffTableCallsHistory error:", error);
    return [];
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
