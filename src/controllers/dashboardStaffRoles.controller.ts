import { Request, Response } from "express";
import { logger } from "../utils/logger";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import {
  createRoleForOwner,
  deleteRoleForOwner,
  getRoleForOwner,
  listRolesForOwner,
  StaffRoleError,
  updateRoleForOwner,
  type RoleServiceError,
} from "../services/menuStaffRoles.service";
import { resolveStaffAdminContext } from "./dashboardStaff.controller";
import { logAccountStaffActivity } from "../services/accountStaffAudit.service";
import { listOwnerMenuIds } from "../services/staffMenuGrants.service";

function sendRoleError(
  req: Request,
  res: Response,
  code: RoleServiceError,
): void {
  switch (code) {
    case "role_name_required":
      sendApiError(res, req, 400, ApiErrors.roleNameRequired);
      return;
    case "role_name_exists":
      sendApiError(res, req, 409, ApiErrors.roleNameExists);
      return;
    case "role_not_found":
      sendApiError(res, req, 404, ApiErrors.roleNotFound);
      return;
    case "invalid_permission":
      sendApiError(res, req, 400, ApiErrors.invalidPermission);
      return;
    case "role_in_use":
      sendApiError(res, req, 409, ApiErrors.roleInUse);
      return;
    case "last_dashboard_access_role":
      sendApiError(res, req, 409, ApiErrors.lastDashboardAccessRole);
      return;
    case "default_role_read_only":
      sendApiError(res, req, 409, ApiErrors.defaultRoleReadOnly);
      return;
    case "no_fields":
      sendApiError(res, req, 400, ApiErrors.noFieldsToUpdate);
      return;
    default:
      sendApiError(res, req, 500, ApiErrors.failedUpdateRole);
  }
}

/** GET /api/dashboard/staff-roles */
export async function listAccountStaffRolesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const context = await resolveStaffAdminContext(req);
    if (!context.ok) {
      sendApiError(res, req, 403, ApiErrors.forbidden);
      return;
    }

    res.json({ roles: await listRolesForOwner(context.ownerUserId) });
  } catch (error) {
    logger.error("listAccountStaffRolesHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedListRoles);
  }
}

/** GET /api/dashboard/staff-roles/:roleId */
export async function getAccountStaffRoleHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const context = await resolveStaffAdminContext(req);
    if (!context.ok) {
      sendApiError(res, req, 403, ApiErrors.forbidden);
      return;
    }

    const role = await getRoleForOwner(
      context.ownerUserId,
      parseInt(req.params.roleId, 10),
    );
    if (!role) {
      sendApiError(res, req, 404, ApiErrors.roleNotFound);
      return;
    }
    res.json({ role });
  } catch (error) {
    logger.error("getAccountStaffRoleHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetRole);
  }
}

/** POST /api/dashboard/staff-roles */
export async function createAccountStaffRoleHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const context = await resolveStaffAdminContext(req);
    if (!context.ok) {
      sendApiError(res, req, 403, ApiErrors.forbidden);
      return;
    }

    const { name, nameEn, permissions, loginPortal } = req.body;
    const role = await createRoleForOwner(context.ownerUserId, {
      name,
      nameEn,
      permissions,
      loginPortal,
    });
    res.status(201).json({ role });

    void logAccountStaffActivity(
      req,
      context.ownerUserId,
      await listOwnerMenuIds(context.ownerUserId),
      {
        action: "STAFF_ROLE_CREATED",
        targetType: "staff_role",
        targetId: role.id,
        summaryAr: `تم إنشاء دور: ${role.name}`,
        summaryEn: `Created role: ${role.name}`,
        after: { name: role.name, permissions: role.permissions },
      },
    );
  } catch (error) {
    if (error instanceof StaffRoleError) {
      sendRoleError(req, res, error.code);
      return;
    }
    logger.error("createAccountStaffRoleHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCreateRole);
  }
}

/** PUT /api/dashboard/staff-roles/:roleId */
export async function updateAccountStaffRoleHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const context = await resolveStaffAdminContext(req);
    if (!context.ok) {
      sendApiError(res, req, 403, ApiErrors.forbidden);
      return;
    }

    const { name, nameEn, permissions, loginPortal } = req.body;
    const { role, before } = await updateRoleForOwner(
      context.ownerUserId,
      parseInt(req.params.roleId, 10),
      { name, nameEn, permissions, loginPortal },
    );
    res.json({ role });

    void logAccountStaffActivity(
      req,
      context.ownerUserId,
      await listOwnerMenuIds(context.ownerUserId),
      {
        action: "STAFF_ROLE_UPDATED",
        targetType: "staff_role",
        targetId: role.id,
        summaryAr: `تم تحديث دور: ${role.name}`,
        summaryEn: `Updated role: ${role.name}`,
        before: { name: before.name, permissions: before.permissions },
        after: { name: role.name, permissions: role.permissions },
      },
    );
  } catch (error) {
    if (error instanceof StaffRoleError) {
      sendRoleError(req, res, error.code);
      return;
    }
    logger.error("updateAccountStaffRoleHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateRole);
  }
}

/** DELETE /api/dashboard/staff-roles/:roleId */
export async function deleteAccountStaffRoleHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const context = await resolveStaffAdminContext(req);
    if (!context.ok) {
      sendApiError(res, req, 403, ApiErrors.forbidden);
      return;
    }

    const role = await deleteRoleForOwner(
      context.ownerUserId,
      parseInt(req.params.roleId, 10),
    );
    res.json({ message: "Role deleted successfully" });

    void logAccountStaffActivity(
      req,
      context.ownerUserId,
      await listOwnerMenuIds(context.ownerUserId),
      {
        action: "STAFF_ROLE_DELETED",
        targetType: "staff_role",
        targetId: role.id,
        summaryAr: `تم حذف دور: ${role.name}`,
        summaryEn: `Deleted role: ${role.name}`,
        before: { name: role.name, permissions: role.permissions },
      },
    );
  } catch (error) {
    if (error instanceof StaffRoleError) {
      sendRoleError(req, res, error.code);
      return;
    }
    logger.error("deleteAccountStaffRoleHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedDeleteRole);
  }
}
