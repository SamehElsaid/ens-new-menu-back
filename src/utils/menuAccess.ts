import type { Request } from "express";
import { getPool, sql } from "../config/database";
import { ROLES } from "../config/constants";

/**
 * Owner: menu.userId === JWT userId.
 * Staff cashier: JWT role staff, MenuStaff row for this menu with cashier job role.
 */
export async function getMenuAccessForRequest(
  req: Request,
  menuId: number,
): Promise<{ ok: true; ownerUserId: number } | { ok: false }> {
  const auth = req.user!;
  const pool = await getPool();

  if (auth.role !== ROLES.STAFF) {
    const r = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("userId", sql.Int, auth.userId)
      .query(
        "SELECT userId FROM Menus WHERE id = @menuId AND userId = @userId",
      );
    if (r.recordset.length === 0) return { ok: false };
    return { ok: true, ownerUserId: auth.userId };
  }

  const r = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("staffId", sql.Int, auth.userId)
    .query(`
      SELECT m.userId AS ownerUserId
      FROM Menus m
      INNER JOIN MenuStaff s ON s.menuId = m.id AND s.id = @staffId
      WHERE m.id = @menuId
        AND LOWER(LTRIM(RTRIM(ISNULL(s.role, '')))) IN ('cashier', 'casher')
    `);

  if (r.recordset.length === 0) return { ok: false };
  return { ok: true, ownerUserId: r.recordset[0].ownerUserId as number };
}

/**
 * Same rules as getMenuAccessForRequest, for Socket.IO subscribe (no Request object).
 */
export async function verifyMenuAccessForSocket(
  userId: number,
  role: string,
  menuId: number,
): Promise<boolean> {
  if (!Number.isFinite(menuId) || menuId <= 0) return false;
  if (!Number.isFinite(userId) || userId <= 0) return false;

  const pool = await getPool();

  if (role !== ROLES.STAFF) {
    const r = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("userId", sql.Int, userId)
      .query(
        "SELECT 1 AS x FROM Menus WHERE id = @menuId AND userId = @userId",
      );
    return r.recordset.length > 0;
  }

  const r = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("staffId", sql.Int, userId)
    .query(`
      SELECT 1 AS x
      FROM Menus m
      INNER JOIN MenuStaff s ON s.menuId = m.id AND s.id = @staffId
      WHERE m.id = @menuId
        AND LOWER(LTRIM(RTRIM(ISNULL(s.role, '')))) IN ('cashier', 'casher')
    `);

  return r.recordset.length > 0;
}

/** Throws if the user does not own the menu (staff cannot access owner analytics). */
export async function assertMenuOwnerAccess(
  menuId: number,
  userId: number,
  role: string,
): Promise<void> {
  if (role === ROLES.STAFF) {
    throw new Error("Forbidden");
  }
  const pool = await getPool();
  const r = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("userId", sql.Int, userId)
    .query(
      "SELECT 1 AS x FROM Menus WHERE id = @menuId AND userId = @userId",
    );
  if (!r.recordset.length) {
    throw new Error("Forbidden");
  }
}

/** Owner account `Users.id` for a menu (internal server use, e.g. FCM to dashboard owner). */
export async function getMenuOwnerUserId(menuId: number): Promise<number | null> {
  if (!Number.isFinite(menuId) || menuId <= 0) return null;
  const pool = await getPool();
  const r = await pool.request().input("menuId", sql.Int, menuId).query(`
      SELECT userId FROM Menus WHERE id = @menuId
    `);
  if (!r.recordset.length) return null;
  const id = r.recordset[0]?.userId;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}
