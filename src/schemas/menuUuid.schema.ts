import { getPool } from "../config/database";
import { logger } from "../utils/logger";

export async function ensureMenuUuidSchema(): Promise<void> {
  const pool = await getPool();

  const colResult = await pool.request().query(`
    SELECT COL_LENGTH('dbo.Menus', 'uuid') AS colLen
  `);

  if (colResult.recordset[0]?.colLen != null) {
    return;
  }

  await pool.request().query(`
    ALTER TABLE dbo.Menus ADD uuid UNIQUEIDENTIFIER NULL;
  `);

  await pool.request().query(`
    UPDATE dbo.Menus SET uuid = NEWID() WHERE uuid IS NULL;
  `);

  await pool.request().query(`
    ALTER TABLE dbo.Menus ALTER COLUMN uuid UNIQUEIDENTIFIER NOT NULL;
  `);

  const indexResult = await pool.request().query(`
    SELECT 1 AS found
    FROM sys.indexes
    WHERE name = N'UX_Menus_uuid'
      AND object_id = OBJECT_ID(N'dbo.Menus')
  `);

  if (indexResult.recordset.length === 0) {
    await pool.request().query(`
      CREATE UNIQUE INDEX UX_Menus_uuid ON dbo.Menus (uuid);
    `);
  }

  logger.info("Menus.uuid column added and backfilled");
}
