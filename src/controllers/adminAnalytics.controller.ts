import { Request, Response } from "express";
import { buildAdminAnalyticsResponse } from "../services/adminAnalytics.service";
import { parseAnalyticsPeriod } from "../utils/analyticsPeriod";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { logger } from "../utils/logger";

export async function getAdminAnalytics(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const period = parseAnalyticsPeriod(req.query.period, "30d");
    const data = await buildAdminAnalyticsResponse(period);
    res.json(data);
  } catch (error) {
    logger.error("Get admin analytics error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetAdminStats);
  }
}
