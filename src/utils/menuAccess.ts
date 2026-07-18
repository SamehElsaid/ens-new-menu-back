import type { Request } from "express";
import { getPool, sql } from "../config/database";
import { ROLES } from "../config/constants";
import { authorization } from "../services/authorization.service";

/** Staff row (menu + roleId) for a staff id, or null if not on this menu. */
async function getStaffMenuRole(
  staffId: number,
  menuId: number,
): Promise<{ ownerUserId: number; roleId: number | null } | null> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("staffId", sql.Int, staffId)
    .query(`
      SELECT m.userId AS ownerUserId, s.roleId AS roleId
      FROM Menus m
      INNER JOIN MenuStaff s ON s.menuId = m.id AND s.id = @staffId
      WHERE m.id = @menuId
    `);
  if (r.recordset.length === 0) return null;
  return {
    ownerUserId: r.recordset[0].ownerUserId as number,
    roleId:
      r.recordset[0].roleId != null ? Number(r.recordset[0].roleId) : null,
  };
}

/**
 * Owner: menu.userId === JWT userId.
 * Staff: MenuStaff row for this menu whose role grants `requiredPermission`
 * (default `dashboard:access`).
 */
export async function getMenuAccessForRequest(
  req: Request,
  menuId: number,
  requiredPermission = "dashboard:access",
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

  const staff = await getStaffMenuRole(auth.userId, menuId);
  if (!staff || staff.roleId == null) return { ok: false };

  const allowed = await authorization.can(
    {
      kind: "staff",
      staffId: auth.userId,
      staffRoleId: staff.roleId,
      menuId,
    },
    requiredPermission,
  );
  if (!allowed) return { ok: false };
  return { ok: true, ownerUserId: staff.ownerUserId };
}

/**
 * Same rules as getMenuAccessForRequest, for Socket.IO subscribe (no Request).
 */
export async function verifyMenuAccessForSocket(
  userId: number,
  role: string,
  menuId: number,
  requiredPermission = "dashboard:access",
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

  const staff = await getStaffMenuRole(userId, menuId);
  if (!staff || staff.roleId == null) return false;

  return authorization.can(
    {
      kind: "staff",
      staffId: userId,
      staffRoleId: staff.roleId,
      menuId,
    },
    requiredPermission,
  );
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
