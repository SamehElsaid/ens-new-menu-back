import { getPool } from "../config/database";
import {
  getMenuStaffColumnMeta,
  quoteMenuStaffIdent,
  resetMenuStaffColumnMetaCache,
} from "../config/menuStaffColumns";
import { logger } from "../utils/logger";

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

/**
 * Creates MenuStaff when missing. Legacy DBs already have this table; fresh
 * environments need an explicit create (column ensure alone is a no-op).
 */
async function ensureMenuStaffTable(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.MenuStaff', 'U') IS NULL
    BEGIN
      EXEC(N'
        CREATE TABLE dbo.MenuStaff (
          id INT IDENTITY(1,1) PRIMARY KEY,
          menuId INT NOT NULL,
          ownerUserId INT NULL,
          name NVARCHAR(200) NOT NULL,
          role NVARCHAR(100) NULL,
          roleId INT NULL,
          phone NVARCHAR(50) NULL,
          email NVARCHAR(255) NULL,
          password NVARCHAR(255) NULL,
          isActive BIT NOT NULL CONSTRAINT DF_MenuStaff_isActive DEFAULT 1,
          expoPushToken NVARCHAR(512) NULL,
          createdAt DATETIME2 NOT NULL
            CONSTRAINT DF_MenuStaff_createdAt DEFAULT SYSUTCDATETIME(),
          CONSTRAINT FK_MenuStaff_Menus FOREIGN KEY (menuId)
            REFERENCES dbo.Menus(id)
        );
        CREATE INDEX IX_MenuStaff_menuId ON dbo.MenuStaff (menuId);
        CREATE INDEX IX_MenuStaff_ownerUserId ON dbo.MenuStaff (ownerUserId);
      ');
    END
  `);
  resetMenuStaffColumnMetaCache();
}

async function ensureIsActiveColumn(): Promise<void> {
  const pool = await getPool();
  const candidates = ["isActive", "active", "available", "isAvailable"] as const;

  for (const columnName of candidates) {
    const result = await pool.request().input("columnName", columnName).query(`
      SELECT DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'MenuStaff' AND COLUMN_NAME = @columnName
    `);
    if (result.recordset.length > 0) {
      return;
    }
  }

  await pool.request().query(`
    IF COL_LENGTH('MenuStaff', 'isActive') IS NULL
    BEGIN
      ALTER TABLE dbo.MenuStaff
        ADD isActive BIT NOT NULL
        CONSTRAINT DF_MenuStaff_isActive DEFAULT 1;
    END
  `);
  resetMenuStaffColumnMetaCache();
  logger.info("MenuStaff.isActive column ensured");
}

async function ensureStaffEmailUniqueIndex(): Promise<void> {
  const meta = await getMenuStaffColumnMeta();
  if (!meta.emailKey) {
    return;
  }

  const pool = await getPool();
  const emailCol = quoteMenuStaffIdent(meta.emailKey);
  const indexName = "UQ_MenuStaff_email";

  const indexCheck = await pool.request().input("indexName", indexName).query(`
      SELECT 1 AS found
      FROM sys.indexes
      WHERE name = @indexName AND object_id = OBJECT_ID('dbo.MenuStaff')
    `);
  if (indexCheck.recordset.length > 0) {
    return;
  }

  // Filtered-index WHERE must use simple comparisons only (no LTRIM/RTRIM).
  const filterPredicate = `${emailCol} IS NOT NULL AND ${emailCol} <> ''`;

  const dupes = await pool.request().query(`
      SELECT LOWER(${emailCol}) AS emailNorm, COUNT(*) AS cnt
      FROM MenuStaff
      WHERE ${filterPredicate}
      GROUP BY LOWER(${emailCol})
      HAVING COUNT(*) > 1
    `);
  if (dupes.recordset.length > 0) {
    logger.warn(
      "MenuStaff has duplicate staff emails; unique index skipped until resolved",
      {
        duplicateCount: dupes.recordset.length,
      },
    );
    return;
  }

  await pool.request().query(`
      CREATE UNIQUE INDEX [${indexName}] ON dbo.MenuStaff (${emailCol})
      WHERE ${filterPredicate};
    `);
  logger.info("MenuStaff email unique index ensured");
}

/** Ensures MenuStaff table exists and supports active/inactive + email uniqueness. */
export async function ensureMenuStaffSchema(): Promise<void> {
  if (!(await tableExists("Menus"))) {
    return;
  }

  await ensureMenuStaffTable();
  if (!(await tableExists("MenuStaff"))) {
    return;
  }

  await ensureIsActiveColumn();
  await ensureStaffEmailUniqueIndex();
  logger.info("MenuStaff schema ensured");
}
