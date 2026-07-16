import { Request, Response, NextFunction } from "express";
import { ROLES } from "../config/constants";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { authorization, type AuthActor } from "../services/authorization.service";

/** Builds an AuthActor from `req.user` (set by verifyToken). */
export function actorFromRequest(req: Request): AuthActor | null {
  const user = req.user;
  if (!user) return null;

  if (user.role === ROLES.STAFF) {
    if (
      typeof user.staffRoleId !== "number" ||
      typeof user.menuId !== "number"
    ) {
      // Legacy staff token without RBAC identity — force re-login.
      return null;
    }
    return {
      kind: "staff",
      staffId: user.userId,
      staffRoleId: user.staffRoleId,
      menuId: user.menuId,
    };
  }

  if (user.role === ROLES.ADMIN) {
    return { kind: "admin", userId: user.userId };
  }

  return { kind: "owner", userId: user.userId };
}

type PermissionCheck = (actor: AuthActor) => Promise<boolean>;

function buildMiddleware(check: PermissionCheck) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const actor = actorFromRequest(req);
    if (!actor) {
      // Staff whose token lacks RBAC identity (deleted role / stale token).
      if (req.user?.role === ROLES.STAFF) {
        sendApiError(res, req, 403, ApiErrors.staffRoleDeleted);
        return;
      }
      sendApiError(res, req, 401, ApiErrors.noToken);
      return;
    }

    try {
      if (await check(actor)) {
        next();
        return;
      }
      sendApiError(res, req, 403, ApiErrors.forbidden);
    } catch {
      sendApiError(res, req, 403, ApiErrors.forbidden);
    }
  };
}

/**
 * Express middleware factory: `requireStaffPermission("orders:complete")`.
 * Also supports `.any([...])` and `.all([...])`.
 */
export function requireStaffPermission(permission: string) {
  return buildMiddleware((actor) => authorization.can(actor, permission));
}

requireStaffPermission.any = (permissions: string[]) =>
  buildMiddleware((actor) => authorization.hasAny(actor, permissions));

requireStaffPermission.all = (permissions: string[]) =>
  buildMiddleware((actor) => authorization.hasAll(actor, permissions));
