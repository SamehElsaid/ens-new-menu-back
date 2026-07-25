import { getPool, sql } from "../config/database";
import {
  expandPermissionsWithDependencies,
  partitionPermissionKeys,
} from "../config/staffPermissions.catalog";
import type { StaffLoginPortal } from "../config/staffRoleDefaults";
import { permissionCache } from "./permissionCache";

export const STAFF_LOGIN_PORTALS: readonly StaffLoginPortal[] = [
  "staff_app",
  "dashboard",
];

export function normalizeLoginPortal(raw: unknown): StaffLoginPortal {
  return raw === "dashboard" ? "dashboard" : "staff_app";
}

export interface StaffRole {
  id: number;
  /** Legacy anchor: null for account-level roles created after the migration. */
  menuId: number | null;
  ownerUserId: number | null;
  /** Primary (Arabic) name — also the uniqueness key inside the account. */
  name: string;
  /** Optional English name; consumers fall back to `name` when it is null. */
  nameEn: string | null;
  permissions: string[];
  isDefault: boolean;
  loginPortal: StaffLoginPortal;
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
  | "default_role_read_only"
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

/** Trimmed name capped to the column length, or null when blank/absent. */
function normalizeOptionalName(raw: unknown): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed ? trimmed.slice(0, 100) : null;
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

const ROLE_SELECT_SQL = `
  SELECT
    r.id, r.menuId, r.ownerUserId, r.name, r.nameEn, r.permissionsJson,
    r.isDefault, r.loginPortal, r.createdAt, r.updatedAt,
    (SELECT COUNT(*) FROM dbo.MenuStaff s WHERE s.roleId = r.id) AS staffCount
  FROM dbo.MenuStaffRoles r
`;

/** Role name in the requested language, falling back to the primary name. */
export function roleDisplayName(
  role: Pick<StaffRole, "name" | "nameEn">,
  locale: string,
): string {
  if (locale === "en") return role.nameEn?.trim() || role.name;
  return role.name;
}

/**
 * SQL expression selecting the role name in the requester's language, for the
 * queries that expose a role name as a flat `roleName` field. Any query using
 * it must bind an `@locale` input (see `getLocaleFromAcceptLanguage`).
 */
export function localizedRoleNameSql(
  roleAlias: string,
  outputAlias: string,
): string {
  return `CASE
      WHEN @locale = 'en' AND NULLIF(LTRIM(RTRIM(${roleAlias}.nameEn)), N'') IS NOT NULL
        THEN ${roleAlias}.nameEn
      ELSE ${roleAlias}.name
    END AS ${outputAlias}`;
}

/** Owner account behind a menu — roles live on the account, not the menu. */
async function getOwnerUserIdForMenu(menuId: number): Promise<number | null> {
  if (!Number.isFinite(menuId) || menuId <= 0) return null;
  const pool = await getPool();
  const result = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .query(`SELECT userId FROM dbo.Menus WHERE id = @menuId`);
  const userId = result.recordset[0]?.userId;
  return Number.isFinite(Number(userId)) ? Number(userId) : null;
}

/** Every role in the account catalog (menu-anchored legacy rows included). */
export async function listRolesForOwner(
  ownerUserId: number,
): Promise<StaffRole[]> {
  if (!Number.isFinite(ownerUserId) || ownerUserId <= 0) return [];
  const pool = await getPool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .query(`
      ${ROLE_SELECT_SQL}
      WHERE r.ownerUserId = @ownerUserId
      ORDER BY r.isDefault DESC, r.name ASC
    `);

  return (result.recordset as Record<string, unknown>[]).map(mapRoleRow);
}

export async function getRoleForOwner(
  ownerUserId: number,
  roleId: number,
): Promise<StaffRole | null> {
  if (!Number.isFinite(ownerUserId) || ownerUserId <= 0) return null;
  const pool = await getPool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("roleId", sql.Int, roleId)
    .query(`
      ${ROLE_SELECT_SQL}
      WHERE r.ownerUserId = @ownerUserId AND r.id = @roleId
    `);

  if (!result.recordset.length) return null;
  return mapRoleRow(result.recordset[0] as Record<string, unknown>);
}

/** Legacy per-menu view of the catalog — resolves through the menu's owner. */
export async function listRolesForMenu(menuId: number): Promise<StaffRole[]> {
  const ownerUserId = await getOwnerUserIdForMenu(menuId);
  if (ownerUserId == null) return [];
  return listRolesForOwner(ownerUserId);
}

export async function getRoleForMenu(
  menuId: number,
  roleId: number,
): Promise<StaffRole | null> {
  const ownerUserId = await getOwnerUserIdForMenu(menuId);
  if (ownerUserId == null) return null;
  return getRoleForOwner(ownerUserId, roleId);
}

function mapRoleRow(row: Record<string, unknown>): StaffRole {
  return {
    id: Number(row.id),
    menuId: row.menuId != null ? Number(row.menuId) : null,
    ownerUserId: row.ownerUserId != null ? Number(row.ownerUserId) : null,
    name: String(row.name),
    nameEn: normalizeOptionalName(row.nameEn),
    permissions: parsePermissionsJson(row.permissionsJson),
    isDefault: Boolean(row.isDefault),
    loginPortal: normalizeLoginPortal(row.loginPortal),
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
  ownerUserId: number,
  name: string,
  excludeRoleId?: number,
): Promise<boolean> {
  const pool = await getPool();
  const request = pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("name", sql.NVarChar(100), name);
  let excludeSql = "";
  if (excludeRoleId != null) {
    excludeSql = " AND id <> @excludeRoleId";
    request.input("excludeRoleId", sql.Int, excludeRoleId);
  }
  const result = await request.query(`
    SELECT TOP 1 id FROM dbo.MenuStaffRoles
    WHERE ownerUserId = @ownerUserId AND name = @name${excludeSql}
  `);
  return result.recordset.length > 0;
}

export interface CreateRoleInput {
  name: unknown;
  nameEn?: unknown;
  permissions?: unknown;
  loginPortal?: unknown;
}

/**
 * Account-level roles are not anchored to a menu, so `menuId` stays NULL and
 * the role survives the deletion of any single menu.
 */
export async function createRoleForOwner(
  ownerUserId: number,
  input: CreateRoleInput,
): Promise<StaffRole> {
  const trimmedName = typeof input.name === "string" ? input.name.trim() : "";
  if (!trimmedName) {
    throw new StaffRoleError("role_name_required");
  }
  const nameEn = normalizeOptionalName(input.nameEn);
  const permissions = resolvePermissions(input.permissions);
  const loginPortal = normalizeLoginPortal(input.loginPortal);

  if (await roleNameExists(ownerUserId, trimmedName)) {
    throw new StaffRoleError("role_name_exists");
  }

  const pool = await getPool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("name", sql.NVarChar(100), trimmedName)
    .input("nameEn", sql.NVarChar(100), nameEn)
    .input(
      "permissionsJson",
      sql.NVarChar(sql.MAX),
      JSON.stringify(permissions),
    )
    .input("loginPortal", sql.NVarChar(20), loginPortal)
    .query(`
      INSERT INTO dbo.MenuStaffRoles
        (menuId, ownerUserId, name, nameEn, permissionsJson, isDefault, loginPortal)
      OUTPUT INSERTED.id
      VALUES (NULL, @ownerUserId, @name, @nameEn, @permissionsJson, 0, @loginPortal)
    `);

  const roleId = Number(result.recordset[0].id);
  permissionCache.set(roleId, permissions);

  const created = await getRoleForOwner(ownerUserId, roleId);
  if (!created) throw new StaffRoleError("role_not_found");
  return created;
}

export async function createRole(
  menuId: number,
  input: CreateRoleInput,
): Promise<StaffRole> {
  const ownerUserId = await getOwnerUserIdForMenu(menuId);
  if (ownerUserId == null) throw new StaffRoleError("role_not_found");
  return createRoleForOwner(ownerUserId, input);
}

export interface UpdateRoleInput {
  name?: string;
  nameEn?: unknown;
  permissions?: unknown;
  loginPortal?: unknown;
}

export async function updateRoleForOwner(
  ownerUserId: number,
  roleId: number,
  input: UpdateRoleInput,
): Promise<{ role: StaffRole; before: StaffRole }> {
  const before = await getRoleForOwner(ownerUserId, roleId);
  if (!before) {
    throw new StaffRoleError("role_not_found");
  }
  // Seeded roles are read-only; duplicating one gives an editable copy.
  if (before.isDefault) {
    throw new StaffRoleError("default_role_read_only");
  }

  const updates: string[] = [];
  const pool = await getPool();
  const request = pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("roleId", sql.Int, roleId);

  if (input.name !== undefined) {
    const trimmed = typeof input.name === "string" ? input.name.trim() : "";
    if (!trimmed) throw new StaffRoleError("role_name_required");
    if (
      trimmed !== before.name &&
      (await roleNameExists(ownerUserId, trimmed, roleId))
    ) {
      throw new StaffRoleError("role_name_exists");
    }
    updates.push("name = @name");
    request.input("name", sql.NVarChar(100), trimmed);
  }

  if (input.nameEn !== undefined) {
    updates.push("nameEn = @nameEn");
    request.input(
      "nameEn",
      sql.NVarChar(100),
      normalizeOptionalName(input.nameEn),
    );
  }

  let nextPermissions = before.permissions;
  if (input.permissions !== undefined) {
    nextPermissions = resolvePermissions(input.permissions);
    updates.push("permissionsJson = @permissionsJson");
    request.input(
      "permissionsJson",
      sql.NVarChar(sql.MAX),
      JSON.stringify(nextPermissions),
    );
  }

  if (input.loginPortal !== undefined) {
    updates.push("loginPortal = @loginPortal");
    request.input(
      "loginPortal",
      sql.NVarChar(20),
      normalizeLoginPortal(input.loginPortal),
    );
  }

  if (updates.length === 0) {
    throw new StaffRoleError("no_fields");
  }

  updates.push("updatedAt = SYSUTCDATETIME()");
  await request.query(`
    UPDATE dbo.MenuStaffRoles
    SET ${updates.join(", ")}
    WHERE id = @roleId AND ownerUserId = @ownerUserId
  `);

  permissionCache.invalidate(roleId);

  const role = await getRoleForOwner(ownerUserId, roleId);
  if (!role) throw new StaffRoleError("role_not_found");
  return { role, before };
}

export async function updateRole(
  menuId: number,
  roleId: number,
  input: UpdateRoleInput,
): Promise<{ role: StaffRole; before: StaffRole }> {
  const ownerUserId = await getOwnerUserIdForMenu(menuId);
  if (ownerUserId == null) throw new StaffRoleError("role_not_found");
  return updateRoleForOwner(ownerUserId, roleId, input);
}

export async function deleteRoleForOwner(
  ownerUserId: number,
  roleId: number,
): Promise<StaffRole> {
  const role = await getRoleForOwner(ownerUserId, roleId);
  if (!role) {
    throw new StaffRoleError("role_not_found");
  }
  if (role.isDefault) {
    throw new StaffRoleError("default_role_read_only");
  }
  if (role.staffCount > 0) {
    throw new StaffRoleError("role_in_use");
  }

  const pool = await getPool();
  await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("roleId", sql.Int, roleId)
    .query(`
      DELETE FROM dbo.MenuStaffRoles
      WHERE id = @roleId AND ownerUserId = @ownerUserId
    `);

  permissionCache.invalidate(roleId);
  return role;
}

export async function deleteRole(
  menuId: number,
  roleId: number,
): Promise<StaffRole> {
  const ownerUserId = await getOwnerUserIdForMenu(menuId);
  if (ownerUserId == null) throw new StaffRoleError("role_not_found");
  return deleteRoleForOwner(ownerUserId, roleId);
}
