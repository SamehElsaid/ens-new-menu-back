import { Request, Response, NextFunction } from "express";
import { getPool, sql } from "../config/database";
import { isUserOnFreePlan } from "../services/subscriptionPlan.service";
import { canUserBulkImport } from "../services/bulkImportUsage.service";
import { getActiveSubscriptionLimits } from "../services/extraMenus.service";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";

export async function checkMenuLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const limits = await getActiveSubscriptionLimits(userId);

    if (!limits) {
      sendApiError(res, req, 403, ApiErrors.noActiveSubscription);
      return;
    }

    const { effectiveMaxMenus, maxMenus, extraMenus, planName, isPro } = limits;

    const pool = await getPool();
    const countResult = await pool
      .request()
      .input("userId", sql.Int, userId)
      .query(
        "SELECT COUNT(*) as count FROM Menus WHERE userId = @userId AND isActive = 1",
      );

    const currentCount = countResult.recordset[0].count;

    if (currentCount >= effectiveMaxMenus) {
      const en = `You have reached the maximum number of menus (${effectiveMaxMenus}) for your ${planName} plan.`;
      const ar = `لقد وصلت للحد الأقصى من القوائم (${effectiveMaxMenus}) لخطة ${planName}.`;
      sendApiError(
        res,
        req,
        403,
        { en, ar },
        {
          code: "MENU_LIMIT_REACHED",
          currentCount,
          maxMenus,
          extraMenus,
          effectiveMaxMenus,
          planName,
          canBuyExtraMenus: isPro,
        },
      );
      return;
    }

    next();
  } catch (error) {
    sendApiError(res, req, 500, ApiErrors.failedCheckMenuLimit);
  }
}

/** Product limits disabled — menus may have unlimited items. */
export async function checkProductLimit(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  next();
}

/** Staff & tables APIs — Pro (paid) plans only; Free users get PRO_REQUIRED. */
export async function requireProPlan(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    if (await isUserOnFreePlan(userId)) {
      sendApiError(
        res,
        req,
        403,
        {
          en: ApiErrors.proFeatureOnly.en,
          ar: ApiErrors.proFeatureOnly.ar,
        },
        { code: "PRO_REQUIRED" },
      );
      return;
    }
    next();
  } catch {
    sendApiError(res, req, 500, ApiErrors.failedVerifySubscription);
  }
}

/** Bulk import — Free: 1 use per user; Pro: unlimited. */
export async function checkBulkImportLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { allowed, used, limit } = await canUserBulkImport(userId);

    if (!allowed) {
      sendApiError(res, req, 403, ApiErrors.bulkImportUsageLimitExceeded, {
        code: "BULK_IMPORT_LIMIT",
        used,
        limit,
        remaining: 0,
      });
      return;
    }

    next();
  } catch {
    sendApiError(res, req, 500, ApiErrors.failedVerifySubscription);
  }
}
