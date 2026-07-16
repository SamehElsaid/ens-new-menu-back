import { Request, Response } from "express";
import { getPool, sql } from "../config/database";
import { logger } from "../utils/logger";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { logMenuActivitySafe } from "../services/menuActivityLog.service";
import {
  createRole,
  deleteRole,
  getRoleForMenu,
  listRolesForMenu,
  StaffRoleError,
  updateRole,
  type RoleServiceError,
} from "../services/menuStaffRoles.service";

async function assertMenuOwner(
  userId: number,
  menuId: number,
): Promise<boolean> {
  const pool = await getPool();
  const check = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("userId", sql.Int, userId)
    .query("SELECT id FROM Menus WHERE id = @menuId AND userId = @userId");
  return check.recordset.length > 0;
}

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
    case "no_fields":
      sendApiError(res, req, 400, ApiErrors.noFieldsToUpdate);
      return;
    default:
      sendApiError(res, req, 500, ApiErrors.failedUpdateRole);
  }
}

export async function listStaffRoles(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const menuId = parseInt(req.params.menuId, 10);

    if (!(await assertMenuOwner(userId, menuId))) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    const roles = await listRolesForMenu(menuId);
    res.json({ roles });
  } catch (error) {
    logger.error("List staff roles error:", error);
    sendApiError(res, req, 500, ApiErrors.failedListRoles);
  }
}

export async function getStaffRoleById(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const menuId = parseInt(req.params.menuId, 10);
    const roleId = parseInt(req.params.roleId, 10);

    if (!(await assertMenuOwner(userId, menuId))) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    const role = await getRoleForMenu(menuId, roleId);
    if (!role) {
      sendApiError(res, req, 404, ApiErrors.roleNotFound);
      return;
    }
    res.json({ role });
  } catch (error) {
    logger.error("Get staff role error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetRole);
  }
}

export async function createStaffRole(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const menuId = parseInt(req.params.menuId, 10);
    const { name, permissions } = req.body;

    if (!(await assertMenuOwner(userId, menuId))) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    const role = await createRole(menuId, name, permissions);
    res.status(201).json({ role });

    void logMenuActivitySafe(req, menuId, {
      action: "STAFF_ROLE_CREATED",
      targetType: "staff_role",
      targetId: role.id,
      summaryAr: `تم إنشاء دور: ${role.name}`,
      summaryEn: `Created role: ${role.name}`,
      detailJson: JSON.stringify({
        roleId: role.id,
        name: role.name,
        permissionsBefore: [],
        permissionsAfter: role.permissions,
      }),
    });
  } catch (error) {
    if (error instanceof StaffRoleError) {
      sendRoleError(req, res, error.code);
      return;
    }
    logger.error("Create staff role error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCreateRole);
  }
}

export async function updateStaffRole(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const menuId = parseInt(req.params.menuId, 10);
    const roleId = parseInt(req.params.roleId, 10);
    const { name, permissions } = req.body;

    if (!(await assertMenuOwner(userId, menuId))) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    const { role, before } = await updateRole(menuId, roleId, {
      name,
      permissions,
    });
    res.json({ role });

    void logMenuActivitySafe(req, menuId, {
      action: "STAFF_ROLE_UPDATED",
      targetType: "staff_role",
      targetId: role.id,
      summaryAr: `تم تحديث دور: ${role.name}`,
      summaryEn: `Updated role: ${role.name}`,
      detailJson: JSON.stringify({
        roleId: role.id,
        name: role.name,
        permissionsBefore: before.permissions,
        permissionsAfter: role.permissions,
      }),
    });
  } catch (error) {
    if (error instanceof StaffRoleError) {
      sendRoleError(req, res, error.code);
      return;
    }
    logger.error("Update staff role error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateRole);
  }
}

export async function deleteStaffRole(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const menuId = parseInt(req.params.menuId, 10);
    const roleId = parseInt(req.params.roleId, 10);

    if (!(await assertMenuOwner(userId, menuId))) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    const role = await deleteRole(menuId, roleId);
    res.json({ message: "Role deleted successfully" });

    void logMenuActivitySafe(req, menuId, {
      action: "STAFF_ROLE_DELETED",
      targetType: "staff_role",
      targetId: role.id,
      summaryAr: `تم حذف دور: ${role.name}`,
      summaryEn: `Deleted role: ${role.name}`,
      detailJson: JSON.stringify({
        roleId: role.id,
        name: role.name,
        permissionsBefore: role.permissions,
        permissionsAfter: [],
      }),
    });
  } catch (error) {
    if (error instanceof StaffRoleError) {
      sendRoleError(req, res, error.code);
      return;
    }
    logger.error("Delete staff role error:", error);
    sendApiError(res, req, 500, ApiErrors.failedDeleteRole);
  }
}
