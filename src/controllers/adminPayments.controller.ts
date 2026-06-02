import { Request, Response } from "express";
import { buildAdminPaymentsResponse } from "../services/adminPayments.service";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { logger } from "../utils/logger";

export async function getAdminPayments(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const status = req.query.status
      ? String(req.query.status)
      : undefined;
    const period = req.query.period
      ? String(req.query.period)
      : undefined;
    const search = req.query.search
      ? String(req.query.search)
      : undefined;
    const source = req.query.source
      ? String(req.query.source)
      : undefined;
    const subscriptionStatus = req.query.subscriptionStatus
      ? String(req.query.subscriptionStatus)
      : undefined;

    const data = await buildAdminPaymentsResponse({
      page,
      limit,
      status: status as Parameters<
        typeof buildAdminPaymentsResponse
      >[0]["status"],
      period: period as Parameters<
        typeof buildAdminPaymentsResponse
      >[0]["period"],
      search,
      source: source as Parameters<
        typeof buildAdminPaymentsResponse
      >[0]["source"],
      subscriptionStatus: subscriptionStatus as Parameters<
        typeof buildAdminPaymentsResponse
      >[0]["subscriptionStatus"],
    });

    res.json(data);
  } catch (error) {
    logger.error("Get admin payments error:", error);
    sendApiError(res, req, 500, {
      en: "Failed to load payments",
      ar: "فشل تحميل المدفوعات",
    });
  }
}
