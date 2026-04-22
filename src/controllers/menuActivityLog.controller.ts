import { Request, Response } from "express";
import { getMenuAccessForRequest } from "../utils/menuAccess";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { listMenuActivityLogs } from "../services/menuActivityLog.service";
import { logger } from "../utils/logger";

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
    const result = await listMenuActivityLogs(
      mid,
      page,
      limit,
      actorNameSearch.length > 0 ? actorNameSearch : null,
    );

    res.json({
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
      entries: result.rows,
    });
  } catch (error) {
    logger.error("listMenuActivityLogsHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedListActivityLog);
  }
}
