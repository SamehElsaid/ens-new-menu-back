/**
 * Persisted guest → staff table calls (StaffTableCalls).
 */

import { getPool, sql } from "../config/database";
import { logger } from "../utils/logger";

export type StaffTableCallRow = {
  id: number;
  menuId: number;
  tableNumber: string;
  createdAt: Date;
};

export async function getMenuIdForStaff(staffId: number): Promise<number | null> {
  try {
    const pool = await getPool();
    const r = await pool
      .request()
      .input("id", sql.Int, staffId)
      .query(
        `SELECT menuId FROM MenuStaff WHERE id = @id AND isActive = 1`
      );
    const menuId = r.recordset[0]?.menuId;
    return typeof menuId === "number" ? menuId : null;
  } catch (error) {
    logger.error("getMenuIdForStaff error:", error);
    return null;
  }
}

export async function createStaffTableCall(
  menuId: number,
  tableNumber: string
): Promise<{ id: number; createdAt: Date } | null> {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("tableNumber", sql.NVarChar, tableNumber)
      .query(`
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
  limit = 100
): Promise<StaffTableCallRow[]> {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("limit", sql.Int, Math.min(Math.max(limit, 1), 500))
      .query(`
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

export async function acknowledgeStaffTableCall(
  callId: number,
  menuId: number
): Promise<boolean> {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("id", sql.Int, callId)
      .input("menuId", sql.Int, menuId)
      .query(`
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
