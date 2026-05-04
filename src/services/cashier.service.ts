import type { Request } from "express";
import { getPool, sql } from "../config/database";
import { isLinkedOwnerDashboardRole } from "../config/constants";

/** Keys matching dashboard sidebar `navSections` item `key` in ens-menu */
export const CASHIER_DASHBOARD_PAGE_KEYS = [
  "overview",
  "personal",
  "categories",
  "items",
  "table",
  "staff",
  "advertisements",
  "settings",
  "history",
] as const;

export type CashierDashboardPageKey =
  (typeof CASHIER_DASHBOARD_PAGE_KEYS)[number];

export function isValidCashierPageKey(key: string): key is CashierDashboardPageKey {
  return (CASHIER_DASHBOARD_PAGE_KEYS as readonly string[]).includes(key);
}

/**
 * JWT / request: subscription checks should use owner for linked dashboard roles.
 */
export function getEffectiveSubscriptionUserId(req: Request): number {
  const u = req.user!;
  if (isLinkedOwnerDashboardRole(u.role) && u.ownerUserId != null) {
    return u.ownerUserId;
  }
  return u.userId;
}

export async function loadCashierAccess(
  cashierUserId: number,
): Promise<{
  ownerUserId: number;
  menuIds: number[];
  pageKeys: string[];
} | null> {
  const pool = await getPool();
  const u = await pool
    .request()
    .input("id", sql.Int, cashierUserId)
    .query(
      `SELECT ownerUserId, role FROM Users WHERE id = @id`,
    );
  if (u.recordset.length === 0) return null;
  const row = u.recordset[0];
  if (
    row.ownerUserId == null ||
    !isLinkedOwnerDashboardRole(row.role as string)
  )
    return null;

  const [menus, pages] = await Promise.all([
    pool
      .request()
      .input("uid", sql.Int, cashierUserId)
      .query(
        `SELECT menuId FROM UserMenuPermission WHERE userId = @uid`,
      ),
    pool
      .request()
      .input("uid", sql.Int, cashierUserId)
      .query(
        `SELECT pageKey FROM UserDashboardPagePermission WHERE userId = @uid`,
      ),
  ]);

  return {
    ownerUserId: row.ownerUserId as number,
    menuIds: (menus.recordset as { menuId: number }[]).map((r) => r.menuId),
    pageKeys: (pages.recordset as { pageKey: string }[]).map((r) => r.pageKey),
  };
}

export async function cashierMenuBelongsToOwner(
  ownerUserId: number,
  menuId: number,
): Promise<boolean> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("ownerId", sql.Int, ownerUserId)
    .query(
      `SELECT 1 AS ok FROM Menus WHERE id = @menuId AND userId = @ownerId`,
    );
  return r.recordset.length > 0;
}
