import { getPool } from "../config/database";
import { logger } from "../utils/logger";
import { seedDefaultRolesForAllOwners } from "./menuStaffRoles.schema";

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

/** `MenuStaffGrants` — which menus each staff member may work on (many-to-many). */
async function ensureGrantsTable(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.MenuStaffGrants', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.MenuStaffGrants (
        id INT IDENTITY(1,1) PRIMARY KEY,
        staffId INT NOT NULL,
        menuId INT NOT NULL,
        createdAt DATETIME2 NOT NULL
          CONSTRAINT DF_MenuStaffGrants_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_MenuStaffGrants_Menus FOREIGN KEY (menuId)
          REFERENCES dbo.Menus(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX UQ_MenuStaffGrants_staffId_menuId
        ON dbo.MenuStaffGrants (staffId, menuId);
      CREATE INDEX IX_MenuStaffGrants_staffId ON dbo.MenuStaffGrants (staffId);
      CREATE INDEX IX_MenuStaffGrants_menuId ON dbo.MenuStaffGrants (menuId);
    END
  `);
}

/** Account scope on staff rows: `ownerUserId` mirrors `Menus.userId`. */
async function ensureStaffOwnerColumn(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(`
    IF COL_LENGTH('dbo.MenuStaff', 'ownerUserId') IS NULL
    BEGIN
      ALTER TABLE dbo.MenuStaff ADD ownerUserId INT NULL;
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_MenuStaff_ownerUserId'
        AND object_id = OBJECT_ID('dbo.MenuStaff')
    )
    AND COL_LENGTH('dbo.MenuStaff', 'ownerUserId') IS NOT NULL
    BEGIN
      CREATE INDEX IX_MenuStaff_ownerUserId ON dbo.MenuStaff (ownerUserId);
    END
  `);
}

/**
 * Account scope on roles. `menuId` becomes nullable so account-level roles are
 * not anchored to a single menu (an anchor would cascade-delete the role with
 * its menu while other menus' staff still reference it).
 */
async function ensureRoleOwnerColumn(): Promise<void> {
  const pool = await getPool();

  await pool.request().query(`
    IF COL_LENGTH('dbo.MenuStaffRoles', 'ownerUserId') IS NULL
    BEGIN
      ALTER TABLE dbo.MenuStaffRoles ADD ownerUserId INT NULL;
    END
  `);

  // (menuId, name) must allow NULL menuId for account roles, and stay unique
  // for the legacy per-menu rows — a filtered index gives both.
  await pool.request().query(`
    IF EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'UQ_MenuStaffRoles_menuId_name'
        AND object_id = OBJECT_ID('dbo.MenuStaffRoles')
        AND has_filter = 0
    )
    BEGIN
      DROP INDEX UQ_MenuStaffRoles_menuId_name ON dbo.MenuStaffRoles;
    END
  `);

  await pool.request().query(`
    IF EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'MenuStaffRoles'
        AND COLUMN_NAME = 'menuId'
        AND IS_NULLABLE = 'NO'
    )
    BEGIN
      ALTER TABLE dbo.MenuStaffRoles ALTER COLUMN menuId INT NULL;
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'UQ_MenuStaffRoles_menuId_name'
        AND object_id = OBJECT_ID('dbo.MenuStaffRoles')
    )
    BEGIN
      CREATE UNIQUE INDEX UQ_MenuStaffRoles_menuId_name
        ON dbo.MenuStaffRoles (menuId, name)
        WHERE menuId IS NOT NULL;
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_MenuStaffRoles_ownerUserId'
        AND object_id = OBJECT_ID('dbo.MenuStaffRoles')
    )
    BEGIN
      CREATE INDEX IX_MenuStaffRoles_ownerUserId
        ON dbo.MenuStaffRoles (ownerUserId);
    END
  `);
}

/**
 * One-shot backfill (idempotent): every legacy staff row gets `ownerUserId`
 * plus a grant for the menu it was bound to, and every role inherits the
 * owner of the menu it was created under. Duplicate role names across an
 * owner's menus are intentionally left as-is for manual cleanup.
 */
async function backfillFromLegacyMenuBinding(): Promise<void> {
  const pool = await getPool();

  const staffOwners = await pool.request().query(`
    UPDATE s
    SET s.ownerUserId = m.userId
    FROM dbo.MenuStaff s
    INNER JOIN dbo.Menus m ON m.id = s.menuId
    WHERE s.ownerUserId IS NULL
  `);

  const roleOwners = await pool.request().query(`
    UPDATE r
    SET r.ownerUserId = m.userId
    FROM dbo.MenuStaffRoles r
    INNER JOIN dbo.Menus m ON m.id = r.menuId
    WHERE r.ownerUserId IS NULL
  `);

  const grants = await pool.request().query(`
    INSERT INTO dbo.MenuStaffGrants (staffId, menuId)
    SELECT s.id, s.menuId
    FROM dbo.MenuStaff s
    INNER JOIN dbo.Menus m ON m.id = s.menuId
    WHERE s.menuId IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM dbo.MenuStaffGrants g
        WHERE g.staffId = s.id AND g.menuId = s.menuId
      )
  `);

  const migrated = {
    staffOwners: Number(staffOwners.rowsAffected?.[0] ?? 0),
    roleOwners: Number(roleOwners.rowsAffected?.[0] ?? 0),
    grants: Number(grants.rowsAffected?.[0] ?? 0),
  };

  if (migrated.staffOwners || migrated.roleOwners || migrated.grants) {
    logger.info("Migrated staff to account scope with menu grants", migrated);
  }
}

/** Account-scoped staff/roles + per-staff menu grants (idempotent). */
export async function ensureMenuStaffGrantsSchema(): Promise<void> {
  if (!(await tableExists("MenuStaff"))) return;
  if (!(await tableExists("Menus"))) return;

  await ensureGrantsTable();
  await ensureStaffOwnerColumn();
  await ensureRoleOwnerColumn();

  try {
    await backfillFromLegacyMenuBinding();
  } catch (error) {
    logger.warn("Staff menu-grants backfill skipped due to error", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await seedDefaultRolesForAllOwners();
  } catch (error) {
    logger.warn("Seeding default account roles skipped due to error", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info("MenuStaffGrants schema ensured");
}
