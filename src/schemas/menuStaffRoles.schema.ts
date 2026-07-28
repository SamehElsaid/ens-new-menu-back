import { getPool, sql } from "../config/database";
import { logger } from "../utils/logger";
import {
  getMenuStaffColumnMeta,
  resetMenuStaffColumnMetaCache,
} from "../config/menuStaffColumns";
import { DEFAULT_STAFF_ROLES } from "../config/staffRoleDefaults";

async function tableExists(tableName: string): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("tableName", tableName)
    .query(`
      SELECT 1 AS found
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = @tableName
    `);
  return result.recordset.length > 0;
}

async function ensureRolesTable(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.MenuStaffRoles', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.MenuStaffRoles (
        id INT IDENTITY(1,1) PRIMARY KEY,
        ownerUserId INT NULL,
        name NVARCHAR(100) NOT NULL,
        nameEn NVARCHAR(100) NULL,
        permissionsJson NVARCHAR(MAX) NULL,
        isDefault BIT NOT NULL CONSTRAINT DF_MenuStaffRoles_isDefault DEFAULT 0,
        loginPortal NVARCHAR(20) NOT NULL CONSTRAINT DF_MenuStaffRoles_loginPortal DEFAULT 'staff_app',
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_MenuStaffRoles_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt DATETIME2 NOT NULL CONSTRAINT DF_MenuStaffRoles_updatedAt DEFAULT SYSUTCDATETIME()
      );
      CREATE UNIQUE INDEX UQ_MenuStaffRoles_ownerUserId_name
        ON dbo.MenuStaffRoles (ownerUserId, name)
        WHERE ownerUserId IS NOT NULL;
      CREATE INDEX IX_MenuStaffRoles_ownerUserId
        ON dbo.MenuStaffRoles (ownerUserId);
    END
  `);
}

/**
 * Adds `loginPortal` to existing MenuStaffRoles tables and backfills it:
 * roles that grant `dashboard:access` become `dashboard`, the rest stay
 * `staff_app`. Idempotent.
 */
async function ensureLoginPortalColumn(): Promise<void> {
  const pool = await getPool();

  await pool.request().query(`
    IF COL_LENGTH('dbo.MenuStaffRoles', 'loginPortal') IS NULL
    BEGIN
      ALTER TABLE dbo.MenuStaffRoles
        ADD loginPortal NVARCHAR(20) NOT NULL
          CONSTRAINT DF_MenuStaffRoles_loginPortal DEFAULT 'staff_app';
    END
  `);

  // Backfill: any role whose permissions include dashboard:access is a
  // dashboard-portal role. Only touch rows still on the default so we never
  // override an explicit choice made after this migration first ran.
  await pool.request().query(`
    UPDATE dbo.MenuStaffRoles
    SET loginPortal = 'dashboard'
    WHERE loginPortal = 'staff_app'
      AND permissionsJson IS NOT NULL
      AND permissionsJson LIKE '%"dashboard:access"%'
  `);
}

/**
 * Adds `nameEn` and backfills it for the seeded default roles, which used to
 * store their Arabic name only. `name` stays the primary (Arabic) name and the
 * uniqueness key; `nameEn` is optional and falls back to `name` when empty.
 * Idempotent.
 */
async function ensureRoleNameEnColumn(): Promise<void> {
  const pool = await getPool();

  await pool.request().query(`
    IF COL_LENGTH('dbo.MenuStaffRoles', 'nameEn') IS NULL
    BEGIN
      ALTER TABLE dbo.MenuStaffRoles ADD nameEn NVARCHAR(100) NULL;
    END
  `);

  for (const def of DEFAULT_STAFF_ROLES) {
    await pool
      .request()
      .input("nameAr", sql.NVarChar(100), def.nameAr)
      .input("nameEn", sql.NVarChar(100), def.nameEn)
      .query(`
        UPDATE dbo.MenuStaffRoles
        SET nameEn = @nameEn
        WHERE isDefault = 1 AND name = @nameAr AND nameEn IS NULL
      `);
  }
}

async function ensureStaffRoleIdColumn(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(`
    IF COL_LENGTH('dbo.MenuStaff', 'roleId') IS NULL
    BEGIN
      ALTER TABLE dbo.MenuStaff ADD roleId INT NULL;
    END
  `);

  // Add FK separately (guarded) so a failed FK does not block the column add.
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_MenuStaff_Role'
    )
    AND COL_LENGTH('dbo.MenuStaff', 'roleId') IS NOT NULL
    AND OBJECT_ID('dbo.MenuStaffRoles', 'U') IS NOT NULL
    BEGIN
      ALTER TABLE dbo.MenuStaff
        ADD CONSTRAINT FK_MenuStaff_Role FOREIGN KEY (roleId)
          REFERENCES dbo.MenuStaffRoles(id);
    END
  `);
  resetMenuStaffColumnMetaCache();
}

/**
 * Seeds the default roles into the account catalog of the menu's owner.
 * Idempotent — an owner adding a second menu reuses the roles they already have.
 * Existing seeded (`isDefault`) rows are updated so permission changes in code
 * land on every account without a manual reset.
 */
export async function ensureDefaultRolesForMenu(menuId: number): Promise<void> {
  if (!Number.isFinite(menuId) || menuId <= 0) return;
  const pool = await getPool();

  const ownerResult = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .query(`SELECT userId FROM dbo.Menus WHERE id = @menuId`);
  const ownerUserId = Number(ownerResult.recordset[0]?.userId);
  if (!Number.isFinite(ownerUserId) || ownerUserId <= 0) return;

  await ensureDefaultRolesForOwner(ownerUserId);
}

export async function ensureDefaultRolesForOwner(
  ownerUserId: number,
): Promise<void> {
  if (!Number.isFinite(ownerUserId) || ownerUserId <= 0) return;
  const pool = await getPool();

  for (const def of DEFAULT_STAFF_ROLES) {
    const permissionsJson = JSON.stringify(def.permissions);
    await pool
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("name", sql.NVarChar(100), def.nameAr)
      .input("nameEn", sql.NVarChar(100), def.nameEn)
      .input("permissionsJson", sql.NVarChar(sql.MAX), permissionsJson)
      .input("loginPortal", sql.NVarChar(20), def.loginPortal)
      .query(`
        IF NOT EXISTS (
          SELECT 1 FROM dbo.MenuStaffRoles
          WHERE ownerUserId = @ownerUserId AND name = @name
        )
        BEGIN
          INSERT INTO dbo.MenuStaffRoles
            (ownerUserId, name, nameEn, permissionsJson, isDefault, loginPortal)
          VALUES (@ownerUserId, @name, @nameEn, @permissionsJson, 1, @loginPortal);
        END
        ELSE
        BEGIN
          UPDATE dbo.MenuStaffRoles
          SET
            nameEn = @nameEn,
            permissionsJson = @permissionsJson,
            loginPortal = @loginPortal,
            isDefault = 1,
            updatedAt = SYSUTCDATETIME()
          WHERE ownerUserId = @ownerUserId
            AND name = @name
            AND isDefault = 1;
        END
      `);
  }
}

/**
 * Seeds the standard staff-app + dashboard roles into every menu owner's
 * catalog. Runs after the account-scope backfill so `ownerUserId` is already
 * populated on legacy rows and no duplicates are created. Also refreshes
 * permissions on existing seeded defaults from `DEFAULT_STAFF_ROLES`.
 */
export async function seedDefaultRolesForAllOwners(): Promise<void> {
  const pool = await getPool();

  for (const def of DEFAULT_STAFF_ROLES) {
    const permissionsJson = JSON.stringify(def.permissions);
    await pool
      .request()
      .input("name", sql.NVarChar(100), def.nameAr)
      .input("nameEn", sql.NVarChar(100), def.nameEn)
      .input("permissionsJson", sql.NVarChar(sql.MAX), permissionsJson)
      .input("loginPortal", sql.NVarChar(20), def.loginPortal)
      .query(`
        INSERT INTO dbo.MenuStaffRoles
          (ownerUserId, name, nameEn, permissionsJson, isDefault, loginPortal)
        SELECT DISTINCT m.userId, @name, @nameEn, @permissionsJson, 1, @loginPortal
        FROM dbo.Menus m
        WHERE NOT EXISTS (
          SELECT 1 FROM dbo.MenuStaffRoles r
          WHERE r.ownerUserId = m.userId AND r.name = @name
        )
      `);

    // Keep seeded defaults in sync with code (read-only for owners).
    await pool
      .request()
      .input("name", sql.NVarChar(100), def.nameAr)
      .input("nameEn", sql.NVarChar(100), def.nameEn)
      .input("permissionsJson", sql.NVarChar(sql.MAX), permissionsJson)
      .input("loginPortal", sql.NVarChar(20), def.loginPortal)
      .query(`
        UPDATE dbo.MenuStaffRoles
        SET
          nameEn = @nameEn,
          permissionsJson = @permissionsJson,
          loginPortal = @loginPortal,
          updatedAt = SYSUTCDATETIME()
        WHERE isDefault = 1 AND name = @name
      `);
  }
}

/**
 * Seeds default roles for the owners of menus that have staff, then maps each
 * staff member's legacy `role` text onto the matching account-level `roleId`.
 * Runs once effectively — staff already assigned a roleId are skipped.
 */
async function migrateLegacyStaffRoles(): Promise<void> {
  const meta = await getMenuStaffColumnMeta();
  const pool = await getPool();

  // Owners of menus that still have staff rows (via menu anchor or grants).
  const ownersResult = await pool.request().query(`
    SELECT DISTINCT m.userId AS ownerUserId
    FROM dbo.MenuStaff s
    INNER JOIN dbo.Menus m ON m.id = s.menuId
    WHERE s.menuId IS NOT NULL
  `);
  const ownerUserIds = (ownersResult.recordset as { ownerUserId: number }[])
    .map((r) => Number(r.ownerUserId))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (ownerUserIds.length === 0) return;

  for (const ownerUserId of ownerUserIds) {
    await ensureDefaultRolesForOwner(ownerUserId);
  }

  // Map legacy text roles when the old `role` column still exists.
  if (meta.roleColumnQuoted) {
    const roleCol = meta.roleColumnQuoted;

    for (const def of DEFAULT_STAFF_ROLES) {
      if (def.legacyRoleValues.length === 0) continue;
      const inList = def.legacyRoleValues
        .map((_, i) => `@legacy${i}`)
        .join(", ");
      const request = pool
        .request()
        .input("roleName", sql.NVarChar(100), def.nameAr);
      def.legacyRoleValues.forEach((val, i) => {
        request.input(`legacy${i}`, sql.NVarChar(100), val);
      });

      await request.query(`
        UPDATE s
        SET s.roleId = r.id
        FROM dbo.MenuStaff s
        INNER JOIN dbo.Menus m ON m.id = s.menuId
        INNER JOIN dbo.MenuStaffRoles r
          ON r.ownerUserId = COALESCE(s.ownerUserId, m.userId)
          AND r.name = @roleName
        WHERE s.roleId IS NULL
          AND LOWER(LTRIM(RTRIM(ISNULL(${roleCol}, '')))) IN (${inList})
      `);
    }
  }

  // Any remaining staff without a roleId → fall back to the waiter role.
  const waiterDef = DEFAULT_STAFF_ROLES.find((d) => d.slug === "waiter");
  if (waiterDef) {
    const result = await pool
      .request()
      .input("roleName", sql.NVarChar(100), waiterDef.nameAr)
      .query(`
        UPDATE s
        SET s.roleId = r.id
        FROM dbo.MenuStaff s
        INNER JOIN dbo.Menus m ON m.id = s.menuId
        INNER JOIN dbo.MenuStaffRoles r
          ON r.ownerUserId = COALESCE(s.ownerUserId, m.userId)
          AND r.name = @roleName
        WHERE s.roleId IS NULL
      `);
    const assigned = Number(result.rowsAffected?.[0] ?? 0);
    if (assigned > 0) {
      logger.info("Backfilled staff with missing roleId to default waiter role", {
        assigned,
      });
    }
  }
}

/** Ensures the dynamic staff-roles table + columns (account-scoped). */
export async function ensureMenuStaffRolesSchema(): Promise<void> {
  if (!(await tableExists("MenuStaff"))) {
    return;
  }
  if (!(await tableExists("Menus"))) {
    return;
  }

  await ensureRolesTable();
  await ensureLoginPortalColumn();
  await ensureRoleNameEnColumn();
  await ensureStaffRoleIdColumn();
  // Legacy roleId mapping + default seeding run in the grants schema step
  // after `ownerUserId` is populated and `menuId` is detached from roles.
  logger.info("MenuStaffRoles schema ensured");
}

/** Maps legacy staff `role` text → account roleId. Call after roles are detached from menus. */
export async function migrateLegacyStaffRoleAssignments(): Promise<void> {
  await migrateLegacyStaffRoles();
}
