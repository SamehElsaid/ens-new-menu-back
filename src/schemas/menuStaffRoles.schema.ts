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
        menuId INT NOT NULL,
        name NVARCHAR(100) NOT NULL,
        permissionsJson NVARCHAR(MAX) NULL,
        isDefault BIT NOT NULL CONSTRAINT DF_MenuStaffRoles_isDefault DEFAULT 0,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_MenuStaffRoles_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt DATETIME2 NOT NULL CONSTRAINT DF_MenuStaffRoles_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_MenuStaffRoles_Menus FOREIGN KEY (menuId)
          REFERENCES dbo.Menus(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX UQ_MenuStaffRoles_menuId_name
        ON dbo.MenuStaffRoles (menuId, name);
    END
  `);
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
 * Seeds the default roles (نادل / كاشير / محضر طعام) for a single menu.
 * Idempotent — skips roles whose name already exists for the menu.
 */
export async function ensureDefaultRolesForMenu(menuId: number): Promise<void> {
  if (!Number.isFinite(menuId) || menuId <= 0) return;
  const pool = await getPool();

  for (const def of DEFAULT_STAFF_ROLES) {
    await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("name", sql.NVarChar(100), def.nameAr)
      .input(
        "permissionsJson",
        sql.NVarChar(sql.MAX),
        JSON.stringify(def.permissions),
      )
      .query(`
        IF NOT EXISTS (
          SELECT 1 FROM dbo.MenuStaffRoles
          WHERE menuId = @menuId AND name = @name
        )
        BEGIN
          INSERT INTO dbo.MenuStaffRoles (menuId, name, permissionsJson, isDefault)
          VALUES (@menuId, @name, @permissionsJson, 1);
        END
      `);
  }
}

/**
 * Seeds default roles for every menu that currently has staff, then maps each
 * staff member's legacy `role` text onto the matching seeded `roleId`.
 * Runs once effectively — staff already assigned a roleId are skipped.
 */
async function migrateLegacyStaffRoles(): Promise<void> {
  const meta = await getMenuStaffColumnMeta();
  const pool = await getPool();

  // Menus that have staff rows.
  const menusResult = await pool.request().query(`
    SELECT DISTINCT menuId FROM dbo.MenuStaff WHERE menuId IS NOT NULL
  `);
  const menuIds = (menusResult.recordset as { menuId: number }[])
    .map((r) => r.menuId)
    .filter((id) => Number.isFinite(id));

  if (menuIds.length === 0) return;

  for (const menuId of menuIds) {
    await ensureDefaultRolesForMenu(menuId);
  }

  // Map legacy text roles when the old `role` column still exists.
  // (If it was already dropped in cleanup, skip straight to the fallback.)
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
        INNER JOIN dbo.MenuStaffRoles r
          ON r.menuId = s.menuId AND r.name = @roleName
        WHERE s.roleId IS NULL
          AND LOWER(LTRIM(RTRIM(ISNULL(${roleCol}, '')))) IN (${inList})
      `);
    }
  }

  // Any remaining staff without a roleId → fall back to the waiter role.
  // Must always run (even when legacy `role` column is gone) so old accounts
  // created before RBAC are not left with NULL and zero permissions.
  const waiterDef = DEFAULT_STAFF_ROLES.find((d) => d.slug === "waiter");
  if (waiterDef) {
    const result = await pool
      .request()
      .input("roleName", sql.NVarChar(100), waiterDef.nameAr)
      .query(`
        UPDATE s
        SET s.roleId = r.id
        FROM dbo.MenuStaff s
        INNER JOIN dbo.MenuStaffRoles r
          ON r.menuId = s.menuId AND r.name = @roleName
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

/** Ensures the dynamic staff-roles schema + migrates legacy waiter/cashier. */
export async function ensureMenuStaffRolesSchema(): Promise<void> {
  if (!(await tableExists("MenuStaff"))) {
    return;
  }
  if (!(await tableExists("Menus"))) {
    return;
  }

  await ensureRolesTable();
  await ensureStaffRoleIdColumn();
  try {
    await migrateLegacyStaffRoles();
  } catch (error) {
    logger.warn("Legacy staff-role migration skipped due to error", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  logger.info("MenuStaffRoles schema ensured");
}
