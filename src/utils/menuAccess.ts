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
