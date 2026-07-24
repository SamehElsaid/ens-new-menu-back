import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { verifyAccessToken, TokenPayload } from "../utils/tokenHelper";
import { ROLES } from "../config/constants";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { TokenBlacklistService } from "../services/tokenBlacklist.service";
import { logger } from "../utils/logger";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export async function verifyToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    sendApiError(res, req, 401, ApiErrors.noToken);
    return;
  }

  const token = authHeader.substring(7);

  try {
    // Check if token is blacklisted
    const isBlacklisted = await TokenBlacklistService.isBlacklisted(token);
    if (isBlacklisted) {
      sendApiError(res, req, 401, ApiErrors.tokenRevoked);
      return;
    }

    const decoded = verifyAccessToken(token);
    req.user = decoded;

    // Staff JWT uses userId = MenuStaff.id — do not run owner subscription expiry on it
    if (decoded.role !== ROLES.STAFF) {
      await checkAndExpireUserSubscription(decoded.userId);
    }

    next();
  } catch (error) {
    const status = error instanceof jwt.TokenExpiredError ? 405 : 401;
    const msg =
      status === 405 ? ApiErrors.tokenExpired : ApiErrors.invalidToken;
    sendApiError(res, req, status, msg);
  }
}

/**
 * Check and expire subscription for a specific user if needed
 */
async function checkAndExpireUserSubscription(userId: number): Promise<void> {
  try {
    const { SubscriptionDowngradeService } =
      await import("../services/subscriptionDowngrade.service");
    await SubscriptionDowngradeService.expireAndDowngradePaidSubscriptionsForUser(
      userId,
    );
  } catch (error) {
    logger.error("Check expired subscription error:", error);
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await verifyToken(req, res, next);
}

/**
 * If `Authorization: Bearer` is present and valid, sets `req.user`. Otherwise continues without `req.user`.
 * Use for guest-capable routes (e.g. payment init).
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.substring(7);
  try {
    const isBlacklisted = await TokenBlacklistService.isBlacklisted(token);
    if (isBlacklisted) {
      return next();
    }
    const decoded = verifyAccessToken(token);
    req.user = decoded;
  } catch {
    /* ignore — optional auth */
  }
  return next();
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await verifyToken(req, res, () => {
    if (req.user?.role !== ROLES.ADMIN) {
      sendApiError(res, req, 403, ApiErrors.adminRequired);
      return;
    }
    next();
  });
}

export async function requireStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await verifyToken(req, res, () => {
    if (req.user?.role !== ROLES.STAFF) {
      sendApiError(res, req, 403, ApiErrors.staffRequired);
      return;
    }
    next();
  });
}

/**
 * Blocks staff tokens from owner-only endpoints (menu create/copy/delete,
 * listing all menus, etc.). Assumes `requireAuth` already populated `req.user`.
 * Owners and admins pass through.
 */
export function rejectStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.user?.role === ROLES.STAFF) {
    sendApiError(res, req, 403, ApiErrors.forbidden);
    return;
  }
  next();
}

export async function requireEmailVerified(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // This will be checked in the database when needed
  // For now, we'll add it to user verification in controllers
  next();
}
