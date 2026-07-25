import { Request, Response } from "express";
import { logger } from "../utils/logger";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import {
  getMenuActivityLogById,
  getMenuIdForOrderLogId,
  listMenuOrdersForMenuIds,
  parseMenuOrderDateParam,
  parseMenuOrderStatusParam,
  type MenuOrderChannel,
} from "../services/menuActivityLog.service";
import { listAccessibleMenus } from "../services/staffMenuGrants.service";
import { menuOwnerHasCapability } from "../services/planCapabilities.service";
import { authorization } from "../services/authorization.service";
import { actorFromRequest } from "../middleware/requireStaffPermission";
import { getMenuAccessForRequest } from "../utils/menuAccess";

export type DashboardOrderMenu = {
  id: number;
  slug: string | null;
  nameAr: string | null;
  nameEn: string | null;
  logo: string | null;
  currency: string | null;
};

function parseChannel(raw: unknown): MenuOrderChannel | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  return value === "delivery" || value === "table" ? value : null;
}

/**
 * Table orders need the Pro table-ordering capability; menus without it are
 * dropped so the aggregate never leaks orders the owner cannot act on.
 */
async function filterMenusByChannelCapability(
  menuIds: number[],
  channel: MenuOrderChannel | null,
): Promise<number[]> {
  if (channel !== "table") return menuIds;
  const checks = await Promise.all(
    menuIds.map(async (id) => ({
      id,
      allowed: await menuOwnerHasCapability(id, "tableOrderingQr"),
    })),
  );
  return checks.filter((c) => c.allowed).map((c) => c.id);
}

/**
 * GET /api/dashboard/orders
 * Orders across every menu the actor may see, with an optional `menuId` filter.
 * The filter is presentation-only: an id the actor has no access to is ignored
 * rather than rejected, while any *action* on such a menu still returns 403.
 */
export async function listDashboardOrdersHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const auth = req.user!;
    const channel = parseChannel(req.query.channel);

    const actor = actorFromRequest(req);
    if (!actor) {
      sendApiError(res, req, 403, ApiErrors.forbidden);
      return;
    }
    const requiredPermission =
      channel === "delivery" ? "delivery:view" : "orders:view";
    if (!(await authorization.can(actor, requiredPermission))) {
      sendApiError(res, req, 403, ApiErrors.forbidden);
      return;
    }

    const menus = await listAccessibleMenus({
      userId: auth.userId,
      role: auth.role,
    });
    const accessibleIds = await filterMenusByChannelCapability(
      menus.map((m) => m.id),
      channel,
    );

    const requestedMenuId = parseInt(String(req.query.menuId ?? ""), 10);
    const scopedIds =
      Number.isFinite(requestedMenuId) && accessibleIds.includes(requestedMenuId)
        ? [requestedMenuId]
        : accessibleIds;

    const dateFrom = parseMenuOrderDateParam(req.query.dateFrom);
    const dateTo = parseMenuOrderDateParam(req.query.dateTo);
    if (dateFrom && dateTo && dateFrom > dateTo) {
      sendApiError(res, req, 400, ApiErrors.validationFailed);
      return;
    }

    const qRaw = req.query.q ?? req.query.search;
    const search = typeof qRaw === "string" ? qRaw.trim().slice(0, 100) : "";
    const directionRaw = String(req.query.direction ?? "desc")
      .trim()
      .toLowerCase();

    const result = await listMenuOrdersForMenuIds(
      scopedIds,
      parseInt(String(req.query.page ?? "1"), 10) || 1,
      parseInt(String(req.query.limit ?? "25"), 10) || 25,
      {
        actorNameSearch: search.length > 0 ? search : null,
        channel,
        dateFrom,
        dateTo,
        status: parseMenuOrderStatusParam(req.query.status),
        direction: directionRaw === "asc" ? "asc" : "desc",
      },
    );

    const menusById = new Map(menus.map((m) => [m.id, m]));
    const entries = result.rows.map((row) => {
      const menu = row.menuId != null ? menusById.get(row.menuId) : undefined;
      return {
        ...row,
        menuSlug: menu?.slug ?? null,
        menuNameAr: menu?.nameAr ?? null,
        menuNameEn: menu?.nameEn ?? null,
        menuLogo: menu?.logo ?? null,
      };
    });

    res.json({
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
      entries,
      calls: entries,
      menus: menus
        .filter((m) => accessibleIds.includes(m.id))
        .map<DashboardOrderMenu>((m) => ({
          id: m.id,
          slug: m.slug,
          nameAr: m.nameAr,
          nameEn: m.nameEn,
          logo: m.logo,
          currency: m.currency,
        })),
    });
  } catch (error) {
    logger.error("listDashboardOrdersHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedListActivityLog);
  }
}

/**
 * GET /api/dashboard/orders/:entryId
 * Order details addressed by log id only; the owning menu is resolved server
 * side and then access-checked exactly like the per-menu endpoint.
 */
export async function getDashboardOrderHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const logId = parseInt(String(req.params.entryId ?? ""), 10);
    if (!Number.isFinite(logId) || logId <= 0) {
      sendApiError(res, req, 400, ApiErrors.validationFailed);
      return;
    }

    const menuId = await getMenuIdForOrderLogId(logId);
    if (menuId == null) {
      sendApiError(res, req, 404, ApiErrors.activityLogNotFound);
      return;
    }

    const access = await getMenuAccessForRequest(req, menuId);
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.activityLogNotFound);
      return;
    }

    const entry = await getMenuActivityLogById(menuId, logId);
    if (!entry) {
      sendApiError(res, req, 404, ApiErrors.activityLogNotFound);
      return;
    }

    res.json({ entry: { ...entry, menuId } });
  } catch (error) {
    logger.error("getDashboardOrderHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetActivityLog);
  }
}
