import { getPool } from "../config/database";
import { logger } from "../utils/logger";

async function columnExists(
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("tableName", tableName)
    .input("columnName", columnName)
    .query(`
      SELECT 1 AS found
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @tableName AND COLUMN_NAME = @columnName
    `);
  return result.recordset.length > 0;
}

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

/** Optional product sizes stored as JSON on MenuItems.sizes */
export async function ensureMenuItemSizesSchema(): Promise<void> {
  if (!(await tableExists("MenuItems"))) {
    return;
  }

  if (await columnExists("MenuItems", "sizes")) {
    return;
  }

  const pool = await getPool();
  try {
    await pool.request().query(`
      ALTER TABLE dbo.MenuItems
      ADD sizes NVARCHAR(MAX) NULL;
    `);
    logger.info("MenuItems.sizes column added");
  } catch (error) {
    logger.error("Failed to add MenuItems.sizes column:", error);
    throw error;
  }
}
