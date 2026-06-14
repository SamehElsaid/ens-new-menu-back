import { Request, Response } from "express";
import { logger } from "../utils/logger";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import {
  listAdminActivityLog,
  type AdminActivityTargetType,
} from "../services/adminActivityLog.service";

export async function getAdminActivityLog(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const action =
      typeof req.query.action === "string" ? req.query.action : undefined;
    const targetType =
      typeof req.query.targetType === "string"
        ? (req.query.targetType as AdminActivityTargetType)
        : undefined;

    const data = await listAdminActivityLog({ page, limit, action, targetType });
    res.json(data);
  } catch (error) {
    logger.error("Get admin activity log error:", error);
    sendApiError(res, req, 500, ApiErrors.internalServerError);
  }
}
