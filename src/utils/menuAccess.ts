import type { Request, Response } from "express";
import { getPool, sql } from "../config/database";
import { ROLES, isLinkedOwnerDashboardRole } from "../config/constants";
import { sendApiError } from "./apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";

export type MenuAccessOptions = {
  /** If set, linked user must have this page key; owners always pass. */
  requiredPageKey?: string;
};

/**
 * Owner: menu.userId === JWT userId.
 * Linked roles (e.g. cashier): rows in UserMenuPermission + optional UserDashboardPagePermission page key.
 * Staff JWTs cannot use dashboard menu APIs.
 */
export async function getMenuAccessForRequest(
  req: Request,
  menuId: number,
  options?: MenuAccessOptions,
): Promise<
  { ok: true; ownerUserId: number } | { ok: false }
> {
  const auth = req.user!;
  const pool = await getPool();

  if (auth.role === ROLES.STAFF) {
    return { ok: false };
  }

  if (isLinkedOwnerDashboardRole(auth.role)) {
    const linkedUserId = auth.userId;
    const acc = await pool
      .request()
      .input("cid", sql.Int, linkedUserId)
      .query(`SELECT ownerUserId, role FROM Users WHERE id = @cid`);
    if (acc.recordset.length === 0) return { ok: false };
    const dbRole = acc.recordset[0].role as string;
    if (dbRole !== auth.role || !isLinkedOwnerDashboardRole(dbRole))
      return { ok: false };
    const ownerUserId = acc.recordset[0].ownerUserId as number | null;
    if (ownerUserId == null) return { ok: false };

    const menuRow = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .query(`SELECT userId FROM Menus WHERE id = @menuId`);
    if (menuRow.recordset.length === 0) return { ok: false };
    if ((menuRow.recordset[0].userId as number) !== ownerUserId) {
      return { ok: false };
    }

    const cma = await pool
      .request()
      .input("uid", sql.Int, linkedUserId)
      .input("menuId", sql.Int, menuId)
      .query(
        `SELECT 1 FROM UserMenuPermission WHERE userId = @uid AND menuId = @menuId`,
      );
    if (cma.recordset.length === 0) return { ok: false };

    if (options?.requiredPageKey) {
      const pk = await pool
        .request()
        .input("uid", sql.Int, linkedUserId)
        .input("pk", sql.NVarChar(64), options.requiredPageKey)
        .query(
          `SELECT 1 FROM UserDashboardPagePermission WHERE userId = @uid AND pageKey = @pk`,
        );
      if (pk.recordset.length === 0) return { ok: false };
    }

    return { ok: true, ownerUserId };
  }

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

export async function ensureMenuRouteAccess(
  req: Request,
  res: Response,
  menuId: number,
  requiredPageKey: string | undefined,
): Promise<boolean> {
  const access = await getMenuAccessForRequest(req, menuId, {
    requiredPageKey,
  });
  if (!access.ok) {
    sendApiError(res, req, 404, ApiErrors.menuNotFoundOrAccess);
    return false;
  }
  return true;
}
