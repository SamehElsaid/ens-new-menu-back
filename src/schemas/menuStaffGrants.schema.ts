import { getPool } from "../config/database";
import { logger } from "../utils/logger";
import { permissionCache } from "../services/permissionCache";
import {
  migrateLegacyStaffRoleAssignments,
  seedDefaultRolesForAllOwners,
} from "./menuStaffRoles.schema";

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
      EXEC(N'CREATE INDEX IX_MenuStaff_ownerUserId ON dbo.MenuStaff (ownerUserId)');
    END
  `);
}

/**
 * Account scope on roles: ensure `ownerUserId` exists. The legacy `menuId`
 * column is removed later by `detachRolesFromMenus`.
 */
async function ensureRoleOwnerColumn(): Promise<void> {
  const pool = await getPool();

  await pool.request().query(`
    IF COL_LENGTH('dbo.MenuStaffRoles', 'ownerUserId') IS NULL
    BEGIN
      ALTER TABLE dbo.MenuStaffRoles ADD ownerUserId INT NULL;
    END
  `);

  // Legacy-only: make menuId nullable. Dynamic SQL so a fresh MenuStaffRoles
  // (no menuId column) does not fail at compile time with Invalid column name.
  await pool.request().query(`
    IF EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'MenuStaffRoles'
        AND COLUMN_NAME = 'menuId'
        AND IS_NULLABLE = 'NO'
    )
    BEGIN
      EXEC(N'
        IF EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE name = ''UQ_MenuStaffRoles_menuId_name''
            AND object_id = OBJECT_ID(''dbo.MenuStaffRoles'')
            AND has_filter = 0
        )
        BEGIN
          DROP INDEX UQ_MenuStaffRoles_menuId_name ON dbo.MenuStaffRoles;
        END

        ALTER TABLE dbo.MenuStaffRoles ALTER COLUMN menuId INT NULL;

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE name = ''UQ_MenuStaffRoles_menuId_name''
            AND object_id = OBJECT_ID(''dbo.MenuStaffRoles'')
        )
        BEGIN
          CREATE UNIQUE INDEX UQ_MenuStaffRoles_menuId_name
            ON dbo.MenuStaffRoles (menuId, name)
            WHERE menuId IS NOT NULL;
        END
      ');
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_MenuStaffRoles_ownerUserId'
        AND object_id = OBJECT_ID('dbo.MenuStaffRoles')
    )
    AND COL_LENGTH('dbo.MenuStaffRoles', 'ownerUserId') IS NOT NULL
    BEGIN
      EXEC(N'CREATE INDEX IX_MenuStaffRoles_ownerUserId ON dbo.MenuStaffRoles (ownerUserId)');
    END
  `);
}

/**
 * One-shot: drop the roles↔menu link. Roles are account-scoped via
 * `ownerUserId` only. Idempotent — no-ops when `menuId` is already gone.
 */
async function detachRolesFromMenus(): Promise<void> {
  const pool = await getPool();

  const colCheck = await pool.request().query(`
    SELECT 1 AS found
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'MenuStaffRoles' AND COLUMN_NAME = 'menuId'
  `);
  if (colCheck.recordset.length === 0) {
    // Still ensure the owner uniqueness index exists on fresh / already-detached DBs.
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = 'UQ_MenuStaffRoles_ownerUserId_name'
          AND object_id = OBJECT_ID('dbo.MenuStaffRoles')
      )
      AND COL_LENGTH('dbo.MenuStaffRoles', 'ownerUserId') IS NOT NULL
      BEGIN
        EXEC(N'
          CREATE UNIQUE INDEX UQ_MenuStaffRoles_ownerUserId_name
            ON dbo.MenuStaffRoles (ownerUserId, name)
            WHERE ownerUserId IS NOT NULL
        ');
      END
    `);
    return;
  }

  // Fill owner from the legacy menu anchor before dropping it (dynamic SQL:
  // batch must not reference menuId unless the column still exists).
  await pool.request().query(`
    EXEC(N'
      UPDATE r
      SET r.ownerUserId = m.userId
      FROM dbo.MenuStaffRoles r
      INNER JOIN dbo.Menus m ON m.id = r.menuId
      WHERE r.ownerUserId IS NULL AND r.menuId IS NOT NULL
    ');
  `);

  // Collapse duplicate (ownerUserId, name) rows: remap staff, then delete extras.
  await pool.request().query(`
    ;WITH ranked AS (
      SELECT
        id,
        ownerUserId,
        name,
        ROW_NUMBER() OVER (
          PARTITION BY ownerUserId, name
          ORDER BY isDefault DESC, id ASC
        ) AS rn
      FROM dbo.MenuStaffRoles
      WHERE ownerUserId IS NOT NULL
    ),
    dups AS (
      SELECT r.id AS dupId, k.id AS keeperId
      FROM ranked r
      INNER JOIN ranked k
        ON k.ownerUserId = r.ownerUserId
       AND k.name = r.name
       AND k.rn = 1
      WHERE r.rn > 1
    )
    UPDATE s
    SET s.roleId = d.keeperId
    FROM dbo.MenuStaff s
    INNER JOIN dups d ON d.dupId = s.roleId
  `);

  const deleted = await pool.request().query(`
    ;WITH ranked AS (
      SELECT
        id,
        ownerUserId,
        name,
        ROW_NUMBER() OVER (
          PARTITION BY ownerUserId, name
          ORDER BY isDefault DESC, id ASC
        ) AS rn
      FROM dbo.MenuStaffRoles
      WHERE ownerUserId IS NOT NULL
    )
    DELETE FROM dbo.MenuStaffRoles
    WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  `);

  await pool.request().query(`
    IF EXISTS (
      SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_MenuStaffRoles_Menus'
    )
    BEGIN
      ALTER TABLE dbo.MenuStaffRoles DROP CONSTRAINT FK_MenuStaffRoles_Menus;
    END
  `);

  await pool.request().query(`
    IF EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'UQ_MenuStaffRoles_menuId_name'
        AND object_id = OBJECT_ID('dbo.MenuStaffRoles')
    )
    BEGIN
      DROP INDEX UQ_MenuStaffRoles_menuId_name ON dbo.MenuStaffRoles;
    END
  `);

  // Drop any other non-PK indexes that include menuId before dropping the column.
  await pool.request().query(`
    DECLARE @sql NVARCHAR(MAX) = N'';
    SELECT @sql = @sql + N'DROP INDEX ' + QUOTENAME(i.name)
      + N' ON dbo.MenuStaffRoles; '
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('dbo.MenuStaffRoles')
      AND i.is_primary_key = 0
      AND i.is_unique_constraint = 0
      AND EXISTS (
        SELECT 1
        FROM sys.index_columns ic
        INNER JOIN sys.columns c
          ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE ic.object_id = i.object_id
          AND ic.index_id = i.index_id
          AND c.name = 'menuId'
      );
    IF LEN(@sql) > 0 EXEC sp_executesql @sql;
  `);

  await pool.request().query(`
    ALTER TABLE dbo.MenuStaffRoles DROP COLUMN menuId;
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'UQ_MenuStaffRoles_ownerUserId_name'
        AND object_id = OBJECT_ID('dbo.MenuStaffRoles')
    )
    BEGIN
      CREATE UNIQUE INDEX UQ_MenuStaffRoles_ownerUserId_name
        ON dbo.MenuStaffRoles (ownerUserId, name)
        WHERE ownerUserId IS NOT NULL;
    END
  `);

  logger.info("Detached MenuStaffRoles from menuId", {
    duplicateRolesRemoved: Number(deleted.rowsAffected?.[0] ?? 0),
  });
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

  let roleOwnersAffected = 0;
  const roleMenuCol = await pool.request().query(`
    SELECT 1 AS found
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'MenuStaffRoles' AND COLUMN_NAME = 'menuId'
  `);
  if (roleMenuCol.recordset.length > 0) {
    const roleOwners = await pool.request().query(`
      UPDATE r
      SET r.ownerUserId = m.userId
      FROM dbo.MenuStaffRoles r
      INNER JOIN dbo.Menus m ON m.id = r.menuId
      WHERE r.ownerUserId IS NULL
    `);
    roleOwnersAffected = Number(roleOwners.rowsAffected?.[0] ?? 0);
  }

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
    roleOwners: roleOwnersAffected,
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
  try {
    await ensureRoleOwnerColumn();
  } catch (error) {
    logger.warn("MenuStaffRoles owner column ensure skipped due to error", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await backfillFromLegacyMenuBinding();
  } catch (error) {
    logger.warn("Staff menu-grants backfill skipped due to error", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await detachRolesFromMenus();
  } catch (error) {
    logger.warn("Detaching roles from menuId skipped due to error", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await migrateLegacyStaffRoleAssignments();
  } catch (error) {
    logger.warn("Legacy staff-role assignment migration skipped due to error", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await seedDefaultRolesForAllOwners();
    // Seeded role permissions may have changed — drop cached resolutions.
    permissionCache.clear();
  } catch (error) {
    logger.warn("Seeding default account roles skipped due to error", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info("MenuStaffGrants schema ensured");
}
