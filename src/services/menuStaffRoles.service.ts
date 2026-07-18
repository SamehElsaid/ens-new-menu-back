import { getPool, sql } from "../config/database";
import {
  expandPermissionsWithDependencies,
  partitionPermissionKeys,
} from "../config/staffPermissions.catalog";
import { permissionCache } from "./permissionCache";

export interface StaffRole {
  id: number;
  menuId: number;
  name: string;
  permissions: string[];
  isDefault: boolean;
  staffCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type RoleServiceError =
  | "role_name_required"
  | "role_name_exists"
  | "role_not_found"
  | "invalid_permission"
  | "role_in_use"
  | "last_dashboard_access_role"
  | "no_fields";

export class StaffRoleError extends Error {
  constructor(public readonly code: RoleServiceError) {
    super(code);
    this.name = "StaffRoleError";
  }
}

function parsePermissionsJson(raw: unknown): string[] {
  if (raw == null) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

/** Permissions for a role id — used by the authorization service (with cache). */
export async function getRolePermissions(roleId: number): Promise<string[]> {
  if (!Number.isFinite(roleId) || roleId <= 0) return [];

  const cached = permissionCache.get(roleId);
  if (cached) return cached;

  const pool = await getPool();
  const result = await pool
    .request()
    .input("roleId", sql.Int, roleId)
    .query(`SELECT permissionsJson FROM dbo.MenuStaffRoles WHERE id = @roleId`);

  if (!result.recordset.length) {
    return [];
  }

  const permissions = parsePermissionsJson(result.recordset[0].permissionsJson);
  permissionCache.set(roleId, permissions);
  return permissions;
}

/** Menu id that owns a role — used to scope authorization to the right menu. */
export async function getRoleMenuId(roleId: number): Promise<number | null> {
  if (!Number.isFinite(roleId) || roleId <= 0) return null;
  const pool = await getPool();
  const result = await pool
    .request()
    .input("roleId", sql.Int, roleId)
    .query(`SELECT menuId FROM dbo.MenuStaffRoles WHERE id = @roleId`);
  if (!result.recordset.length) return null;
  const menuId = result.recordset[0].menuId as number;
  return Number.isFinite(menuId) ? menuId : null;
}

export async function listRolesForMenu(menuId: number): Promise<StaffRole[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .query(`
      SELECT
        r.id, r.menuId, r.name, r.permissionsJson, r.isDefault,
        r.createdAt, r.updatedAt,
        (SELECT COUNT(*) FROM dbo.MenuStaff s WHERE s.roleId = r.id) AS staffCount
      FROM dbo.MenuStaffRoles r
      WHERE r.menuId = @menuId
      ORDER BY r.isDefault DESC, r.name ASC
    `);

  return (result.recordset as Record<string, unknown>[]).map(mapRoleRow);
}

export async function getRoleForMenu(
  menuId: number,
  roleId: number,
): Promise<StaffRole | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("roleId", sql.Int, roleId)
    .query(`
      SELECT
        r.id, r.menuId, r.name, r.permissionsJson, r.isDefault,
        r.createdAt, r.updatedAt,
        (SELECT COUNT(*) FROM dbo.MenuStaff s WHERE s.roleId = r.id) AS staffCount
      FROM dbo.MenuStaffRoles r
      WHERE r.menuId = @menuId AND r.id = @roleId
    `);

  if (!result.recordset.length) return null;
  return mapRoleRow(result.recordset[0] as Record<string, unknown>);
}

function mapRoleRow(row: Record<string, unknown>): StaffRole {
  return {
    id: Number(row.id),
    menuId: Number(row.menuId),
    name: String(row.name),
    permissions: parsePermissionsJson(row.permissionsJson),
    isDefault: Boolean(row.isDefault),
    staffCount: Number(row.staffCount ?? 0),
    createdAt: row.createdAt as Date | undefined,
    updatedAt: row.updatedAt as Date | undefined,
  };
}

/**
 * Validates + expands the requested permissions. Throws `invalid_permission`
 * when unknown keys are present.
 */
export function resolvePermissions(input: unknown): string[] {
  const { valid, unknown } = partitionPermissionKeys(input);
  if (unknown.length > 0) {
    throw new StaffRoleError("invalid_permission");
  }
  return expandPermissionsWithDependencies(valid);
}

async function roleNameExists(
  menuId: number,
  name: string,
  excludeRoleId?: number,
): Promise<boolean> {
  const pool = await getPool();
  const request = pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("name", sql.NVarChar(100), name);
  let excludeSql = "";
  if (excludeRoleId != null) {
    excludeSql = " AND id <> @excludeRoleId";
    request.input("excludeRoleId", sql.Int, excludeRoleId);
  }
  const result = await request.query(`
    SELECT TOP 1 id FROM dbo.MenuStaffRoles
    WHERE menuId = @menuId AND name = @name${excludeSql}
  `);
  return result.recordset.length > 0;
}

/** Count of roles in a menu that grant `dashboard:access`, optionally excluding one. */
async function countDashboardAccessRoles(
  menuId: number,
  excludeRoleId?: number,
): Promise<number> {
  const roles = await listRolesForMenu(menuId);
  return roles.filter(
    (r) =>
      r.permissions.includes("dashboard:access") &&
      (excludeRoleId == null || r.id !== excludeRoleId),
  ).length;
}

export async function createRole(
  menuId: number,
  name: string,
  permissionsInput: unknown,
): Promise<StaffRole> {
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    throw new StaffRoleError("role_name_required");
  }
  const permissions = resolvePermissions(permissionsInput);

  if (await roleNameExists(menuId, trimmedName)) {
    throw new StaffRoleError("role_name_exists");
  }

  const pool = await getPool();
  const result = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("name", sql.NVarChar(100), trimmedName)
    .input(
      "permissionsJson",
      sql.NVarChar(sql.MAX),
      JSON.stringify(permissions),
    )
    .query(`
      INSERT INTO dbo.MenuStaffRoles (menuId, name, permissionsJson, isDefault)
      OUTPUT INSERTED.id
      VALUES (@menuId, @name, @permissionsJson, 0)
    `);

  const roleId = Number(result.recordset[0].id);
  permissionCache.set(roleId, permissions);

  const created = await getRoleForMenu(menuId, roleId);
  if (!created) throw new StaffRoleError("role_not_found");
  return created;
}

export interface UpdateRoleInput {
  name?: string;
  permissions?: unknown;
}

export async function updateRole(
  menuId: number,
  roleId: number,
  input: UpdateRoleInput,
): Promise<{ role: StaffRole; before: StaffRole }> {
  const before = await getRoleForMenu(menuId, roleId);
  if (!before) {
    throw new StaffRoleError("role_not_found");
  }

  const updates: string[] = [];
  const pool = await getPool();
  const request = pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("roleId", sql.Int, roleId);

  if (input.name !== undefined) {
    const trimmed = typeof input.name === "string" ? input.name.trim() : "";
    if (!trimmed) throw new StaffRoleError("role_name_required");
    if (
      trimmed !== before.name &&
      (await roleNameExists(menuId, trimmed, roleId))
    ) {
      throw new StaffRoleError("role_name_exists");
    }
    updates.push("name = @name");
    request.input("name", sql.NVarChar(100), trimmed);
  }

  let nextPermissions = before.permissions;
  if (input.permissions !== undefined) {
    nextPermissions = resolvePermissions(input.permissions);
    // Guard: do not let this edit remove the last dashboard-access role.
    if (
      before.permissions.includes("dashboard:access") &&
      !nextPermissions.includes("dashboard:access")
    ) {
      const others = await countDashboardAccessRoles(menuId, roleId);
      if (others === 0) {
        throw new StaffRoleError("last_dashboard_access_role");
      }
    }
    updates.push("permissionsJson = @permissionsJson");
    request.input(
      "permissionsJson",
      sql.NVarChar(sql.MAX),
      JSON.stringify(nextPermissions),
    );
  }

  if (updates.length === 0) {
    throw new StaffRoleError("no_fields");
  }

  updates.push("updatedAt = SYSUTCDATETIME()");
  await request.query(`
    UPDATE dbo.MenuStaffRoles
    SET ${updates.join(", ")}
    WHERE id = @roleId AND menuId = @menuId
  `);

  permissionCache.invalidate(roleId);

  const role = await getRoleForMenu(menuId, roleId);
  if (!role) throw new StaffRoleError("role_not_found");
  return { role, before };
}

export async function deleteRole(
  menuId: number,
  roleId: number,
): Promise<StaffRole> {
  const role = await getRoleForMenu(menuId, roleId);
  if (!role) {
    throw new StaffRoleError("role_not_found");
  }
  if (role.staffCount > 0) {
    throw new StaffRoleError("role_in_use");
  }
  if (role.permissions.includes("dashboard:access")) {
    const others = await countDashboardAccessRoles(menuId, roleId);
    if (others === 0) {
      throw new StaffRoleError("last_dashboard_access_role");
    }
  }

  const pool = await getPool();
  await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("roleId", sql.Int, roleId)
    .query(`
      DELETE FROM dbo.MenuStaffRoles WHERE id = @roleId AND menuId = @menuId
    `);

  permissionCache.invalidate(roleId);
  return role;
}
