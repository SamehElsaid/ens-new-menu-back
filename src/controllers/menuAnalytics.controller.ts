import { Request, Response } from "express";
import { buildMenuAnalyticsResponse } from "../services/menuAnalytics.service";
import { parseAnalyticsPeriod } from "../utils/analyticsPeriod";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { logger } from "../utils/logger";

export async function getMenuAnalytics(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const menuId = Number(req.params.menuId);
    if (!Number.isFinite(menuId) || menuId <= 0) {
      sendApiError(res, req, 400, ApiErrors.menuNotFound);
      return;
    }

    const period = parseAnalyticsPeriod(req.query.period, "7d");
    const data = await buildMenuAnalyticsResponse(
      menuId,
      req.user!.userId,
      req.user!.role,
      period,
    );
    res.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") {
      sendApiError(res, req, 403, ApiErrors.menuNotFoundOrAccess);
      return;
    }
    logger.error("Get menu analytics error:", error);
    sendApiError(res, req, 500, {
      en: "Failed to load menu analytics",
      ar: "فشل تحميل تحليلات المنيو",
    });
  }
}
