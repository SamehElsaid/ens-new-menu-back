import { Request, Response, NextFunction } from "express";
import { getPool, sql } from "../config/database";
import { isUserOnFreePlan } from "../services/subscriptionPlan.service";
import { canUserBulkImport } from "../services/bulkImportUsage.service";
import { getActiveSubscriptionLimits } from "../services/extraMenus.service";
import {
  hasCapability,
  menuOwnerHasCapability,
} from "../services/planCapabilities.service";
import { getMenuOwnerUserId } from "../utils/menuAccess";
import type { BooleanCapabilityKey } from "../types/planCapabilities";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";

/**
 * Plan gating on `/api/menus/:menuId/...` must follow the MENU OWNER's plan, not
 * the requester — dashboard staff carry `userId = MenuStaff.id`, which has no
 * subscription. Resolve the owner id from the route `menuId` when present and
 * fall back to the requester (owner-scoped, non-menu routes).
 */
async function resolvePlanOwnerId(req: Request): Promise<number> {
  const menuId = Number(req.params.menuId);
  if (Number.isInteger(menuId) && menuId > 0) {
    const ownerId = await getMenuOwnerUserId(menuId);
    if (ownerId != null) return ownerId;
  }
  return req.user!.userId;
}

export type ActiveMenuLimitCheck = {
  allowed: boolean;
  effectiveMaxMenus: number;
  activeCount: number;
  maxMenus: number;
  extraMenus: number;
  planName: string;
  isPro: boolean;
};

/** Whether activating `menuId` would exceed the user's active-menu allowance. */
export async function checkActiveMenuLimitForActivation(
  userId: number,
  menuId: number,
): Promise<ActiveMenuLimitCheck> {
  const limits = await getActiveSubscriptionLimits(userId);
  const pool = await getPool();
  const countResult = await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("menuId", sql.Int, menuId)
    .query(`
      SELECT COUNT(*) AS count
      FROM Menus
      WHERE userId = @userId AND isActive = 1 AND id <> @menuId
    `);

  const otherActiveCount = Number(countResult.recordset[0]?.count ?? 0);

  if (!limits) {
    return {
      allowed: false,
      effectiveMaxMenus: 1,
      activeCount: otherActiveCount,
      maxMenus: 1,
      extraMenus: 0,
      planName: "Free",
      isPro: false,
    };
  }

  return {
    allowed: otherActiveCount < limits.effectiveMaxMenus,
    effectiveMaxMenus: limits.effectiveMaxMenus,
    activeCount: otherActiveCount,
    maxMenus: limits.maxMenus,
    extraMenus: limits.extraMenus,
    planName: limits.planName,
    isPro: limits.isPro,
  };
}

/** Reject menu activation when the active-menu limit is already reached. */
export async function enforceActiveMenuLimitOnActivation(
  req: Request,
  res: Response,
  userId: number,
  menuId: number,
): Promise<boolean> {
  const check = await checkActiveMenuLimitForActivation(userId, menuId);

  if (check.allowed) {
    return true;
  }

  const en = `You have reached the maximum number of active menus (${check.effectiveMaxMenus}) for your ${check.planName} plan.`;
  const ar = `لقد وصلت للحد الأقصى من القوائم النشطة (${check.effectiveMaxMenus}) لخطة ${check.planName}.`;
  sendApiError(
    res,
    req,
    403,
    { en, ar },
    {
      code: "ACTIVE_MENU_LIMIT_REACHED",
      currentCount: check.activeCount,
      maxMenus: check.maxMenus,
      extraMenus: check.extraMenus,
      effectiveMaxMenus: check.effectiveMaxMenus,
      planName: check.planName,
      canBuyExtraMenus: check.isPro,
    },
  );
  return false;
}

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
    const ownerId = await resolvePlanOwnerId(req);
    if (await isUserOnFreePlan(ownerId)) {
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

/** Require a specific boolean capability from the user's active plan. */
export function requirePlanCapability(key: BooleanCapabilityKey) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const menuId = Number(req.params.menuId);
      const ok =
        Number.isInteger(menuId) && menuId > 0
          ? await menuOwnerHasCapability(menuId, key)
          : await hasCapability(req.user!.userId, key);
      if (!ok) {
        sendApiError(
          res,
          req,
          403,
          {
            en: ApiErrors.proFeatureOnly.en,
            ar: ApiErrors.proFeatureOnly.ar,
          },
          { code: "PLAN_CAPABILITY_REQUIRED", capability: key },
        );
        return;
      }
      next();
    } catch {
      sendApiError(res, req, 500, ApiErrors.failedVerifySubscription);
    }
  };
}

/** Bulk import — gated by plan `aiMenuImport` capability. */
export async function checkBulkImportLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ownerId = await resolvePlanOwnerId(req);
    const { allowed, used, limit } = await canUserBulkImport(ownerId);

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
