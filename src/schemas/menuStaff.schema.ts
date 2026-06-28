import { getPool } from "../config/database";
import { resetMenuStaffColumnMetaCache } from "../config/menuStaffColumns";
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

/** Ensures MenuStaff supports active/inactive status (same pattern as MenuTables). */
export async function ensureMenuStaffSchema(): Promise<void> {
  if (!(await tableExists("MenuStaff"))) {
    return;
  }

  await ensureIsActiveColumn();
}
