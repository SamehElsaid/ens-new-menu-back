import { Request, Response } from "express";
import { getMenuAccessForRequest } from "../utils/menuAccess";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import {
  listMenuActivityLogs,
  getMenuActivityLogById,
  listMenuAuditLogs,
  applyMenuOrderAction,
  type MenuOrderChannel,
  type MenuOrderActionType,
} from "../services/menuActivityLog.service";
import { menuOwnerHasProPlan } from "../services/subscriptionPlan.service";
import { logger } from "../utils/logger";

/**
 * GET /api/menus/:menuId/activity-logs/:id
 */
export async function getMenuActivityLogByIdHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { menuId, id } = req.params;
    const mid = parseInt(menuId, 10);
    const logId = parseInt(id, 10);

    if (!Number.isFinite(mid) || mid <= 0 || !Number.isFinite(logId) || logId <= 0) {
      sendApiError(res, req, 400, ApiErrors.validationFailed);
      return;
    }

    const access = await getMenuAccessForRequest(req, mid);
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    const entry = await getMenuActivityLogById(mid, logId);
    if (!entry) {
      sendApiError(res, req, 404, ApiErrors.activityLogNotFound);
      return;
    }

    res.json({ entry });
  } catch (error) {
    logger.error("getMenuActivityLogByIdHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetActivityLog);
  }
}

/**
 * GET /api/menus/:menuId/activity-logs?page=1&limit=20
 */
export async function listMenuActivityLogsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { menuId } = req.params;
    const mid = parseInt(menuId, 10);
    if (!Number.isFinite(mid) || mid <= 0) {
      sendApiError(res, req, 400, ApiErrors.validationFailed);
      return;
    }

    const access = await getMenuAccessForRequest(req, mid);
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
    const limit = parseInt(String(req.query.limit ?? "25"), 10) || 25;
    const qRaw = req.query.q ?? req.query.search;
    const actorNameSearch =
      typeof qRaw === "string" ? qRaw.trim().slice(0, 100) : "";
    const channelRaw = String(req.query.channel ?? "").trim().toLowerCase();
    const channel: MenuOrderChannel | null =
      channelRaw === "delivery" || channelRaw === "table" ? channelRaw : null;
    const result = await listMenuActivityLogs(
      mid,
      page,
      limit,
      actorNameSearch.length > 0 ? actorNameSearch : null,
      channel,
    );

    res.json({
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
      entries: result.rows,
      calls: result.rows,
    });
  } catch (error) {
    logger.error("listMenuActivityLogsHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedListActivityLog);
  }
}

/**
 * GET /api/menus/:menuId/audit-logs?page=1&limit=500
 */
export async function listMenuAuditLogsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { menuId } = req.params;
    const mid = parseInt(menuId, 10);
    if (!Number.isFinite(mid) || mid <= 0) {
      sendApiError(res, req, 400, ApiErrors.validationFailed);
      return;
    }

    const access = await getMenuAccessForRequest(req, mid);
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
    const limit = parseInt(String(req.query.limit ?? "500"), 10) || 500;
    const qRaw = req.query.q ?? req.query.search;
    const search =
      typeof qRaw === "string" ? qRaw.trim().slice(0, 100) : "";

    const result = await listMenuAuditLogs(
      mid,
      page,
      limit,
      search.length > 0 ? search : null,
    );

    res.json({
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
      entries: result.rows,
    });
  } catch (error) {
    logger.error("listMenuAuditLogsHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedListActivityLog);
  }
}

const MENU_ORDER_ACTIONS = new Set<MenuOrderActionType>([
  "TABLE_CALL_CONFIRMED",
  "TABLE_CALL_CANCELLED",
  "TABLE_CALL_PREPARED",
  "TABLE_CALL_DELIVERED",
]);

/**
 * POST /api/menus/:menuId/activity-logs/:id/actions
 * Body: { action: TABLE_CALL_CONFIRMED | TABLE_CALL_CANCELLED | TABLE_CALL_PREPARED | TABLE_CALL_DELIVERED }
 */
export async function postMenuOrderActionHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { menuId, id } = req.params;
    const mid = parseInt(menuId, 10);
    const logId = parseInt(id, 10);

    if (!Number.isFinite(mid) || mid <= 0 || !Number.isFinite(logId) || logId <= 0) {
      sendApiError(res, req, 400, ApiErrors.validationFailed);
      return;
    }

    const access = await getMenuAccessForRequest(req, mid);
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    if (!(await menuOwnerHasProPlan(mid))) {
      sendApiError(res, req, 403, ApiErrors.proFeatureOnly, {
        code: "PRO_REQUIRED",
      });
      return;
    }

    const action = String(req.body?.action ?? "").trim() as MenuOrderActionType;
    if (!MENU_ORDER_ACTIONS.has(action)) {
      sendApiError(res, req, 400, ApiErrors.validationFailed);
      return;
    }

    const result = await applyMenuOrderAction(mid, logId, action, req);
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        sendApiError(res, req, 404, ApiErrors.activityLogNotFound);
        return;
      }
      if (result.error === "INVALID_STATE") {
        sendApiError(res, req, 409, ApiErrors.callNotFoundOrNotPending);
        return;
      }
      sendApiError(res, req, 500, ApiErrors.failedUpdateCallItems);
      return;
    }

    res.json({ ok: true, status: result.status });
  } catch (error) {
    logger.error("postMenuOrderActionHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateCallItems);
  }
}
